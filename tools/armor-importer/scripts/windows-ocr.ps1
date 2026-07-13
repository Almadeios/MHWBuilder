param(
    [Parameter(Mandatory = $true)]
    [string]$ImagePath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Await-WinRt {
    param(
        [Parameter(Mandatory = $true)]$Operation,
        [Parameter(Mandatory = $true)][Type]$ResultType
    )
    $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and
            $_.GetParameters().Count -eq 1
        } | Select-Object -First 1
    $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    return $task.GetAwaiter().GetResult()
}

$storageFileType = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$randomAccessStreamType = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$bitmapDecoderType = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$softwareBitmapType = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$ocrEngineType = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$ocrResultType = [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime]

$resolvedPath = (Resolve-Path -LiteralPath $ImagePath).Path
$file = Await-WinRt ($storageFileType::GetFileFromPathAsync($resolvedPath)) $storageFileType
$stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) $randomAccessStreamType
$decoder = Await-WinRt ($bitmapDecoderType::CreateAsync($stream)) $bitmapDecoderType
$bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) $softwareBitmapType
$engine = $ocrEngineType::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) { throw 'Windows OCR could not create an English recognizer.' }
$result = Await-WinRt ($engine.RecognizeAsync($bitmap)) $ocrResultType

Add-Type -AssemblyName System.Drawing
$drawingBitmap = [System.Drawing.Bitmap]::new($resolvedPath)
$slotsWord = $result.Lines.Words | Where-Object { $_.Text -match '^Slots?$' } | Select-Object -First 1
$slotMetrics = @()
if ($null -ne $slotsWord) {
    $centerY = [int][Math]::Round($slotsWord.BoundingRect.Y + ($slotsWord.BoundingRect.Height / 2))
    foreach ($ratio in @(0.675, 0.785, 0.895)) {
        $centerX = [int][Math]::Round($drawingBitmap.Width * $ratio)
        $points = @()
        for ($y = [Math]::Max(0, $centerY - 13); $y -le [Math]::Min($drawingBitmap.Height - 1, $centerY + 13); $y++) {
            for ($x = [Math]::Max(0, $centerX - 13); $x -le [Math]::Min($drawingBitmap.Width - 1, $centerX + 13); $x++) {
                $color = $drawingBitmap.GetPixel($x, $y)
                $maximum = [Math]::Max($color.R, [Math]::Max($color.G, $color.B))
                $minimum = [Math]::Min($color.R, [Math]::Min($color.G, $color.B))
                if (($maximum - $minimum) -le 28 -and $maximum -ge 75) {
                    $points += ,@($x, $y)
                }
            }
        }
        $slotMetrics += [ordered]@{
            centerX = $centerX
            centerY = $centerY
            pixels = $points.Count
            width = if ($points.Count) { ($points | ForEach-Object { $_[0] } | Measure-Object -Maximum).Maximum -
                    ($points | ForEach-Object { $_[0] } | Measure-Object -Minimum).Minimum + 1 } else { 0 }
            height = if ($points.Count) { ($points | ForEach-Object { $_[1] } | Measure-Object -Maximum).Maximum -
                    ($points | ForEach-Object { $_[1] } | Measure-Object -Minimum).Minimum + 1 } else { 0 }
            rows = @(-10, -7, -4, 0, 4, 7, 10 | ForEach-Object {
                $sampleY = $centerY + $_
                @($points | Where-Object { $_[1] -eq $sampleY }).Count
            })
            rowRuns = @(-10..8 | ForEach-Object {
                $sampleY = $centerY + $_
                $xs = @($points | Where-Object { $_[1] -eq $sampleY -and
                    $_[0] -ge ($centerX - 13) -and $_[0] -le ($centerX + 13) } |
                    ForEach-Object { $_[0] } | Sort-Object -Unique)
                $runs = 0
                $previous = -999
                foreach ($pointX in $xs) {
                    if ($pointX -gt ($previous + 1)) { $runs++ }
                    $previous = $pointX
                }
                $runs
            })
        }
    }
}

$output = [ordered]@{
    image = $resolvedPath
    text = $result.Text
    slotMetrics = $slotMetrics
    lines = @($result.Lines | ForEach-Object {
        [ordered]@{
            text = $_.Text
            words = @($_.Words | ForEach-Object {
                [ordered]@{
                    text = $_.Text
                    x = $_.BoundingRect.X
                    y = $_.BoundingRect.Y
                    width = $_.BoundingRect.Width
                    height = $_.BoundingRect.Height
                }
            })
        }
    })
}

$stream.Dispose()
$bitmap.Dispose()
$drawingBitmap.Dispose()
$json = $output | ConvertTo-Json -Depth 6 -Compress
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
