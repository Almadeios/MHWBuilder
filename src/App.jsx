import { useState, useEffect } from "react";
import "./App.css";
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import SearchRounded from '@mui/icons-material/SearchRounded';
import BookmarkBorderRounded from '@mui/icons-material/BookmarkBorderRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import DiamondOutlined from '@mui/icons-material/DiamondOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import Search from "./components/Search";
import CustomTabPanel from "./components/CustomTabPanel";
import SavedSets from "./components/SavedSets";
import DecoInventory from "./components/DecoInventory";
import CharmCreator from "./components/CharmCreator";
import Settings from "./components/Settings";
import { useStorage } from "./hooks/StorageContext";
import VersionUpdater from "./components/VersionUpdater";
import SharedSetImportDialog from './components/SharedSetImportDialog';
// import { compareArmor } from "./util/kiranico";

const App = () => {
  const { dismissSharedSetPreview, sharedSetPreview, swapTab, setSwapTab } = useStorage();
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (swapTab) {
      setTab(swapTab);
      setSwapTab(false);
    }
  }, [swapTab]);

  const tabProps = index => {
    return {
      "id": `simple-tab-${index}`,
      'aria-controls': `simple-tabpanel-${index}`,
    };
  };

  const handleTabChange = (event, newValue) => {
    setTab(newValue);
  };

  const tabs = {
    "Search": 0,
    "Saved Sets": 1,
    "Decorations": 2,
    "Charm Creator": 3,
    "Settings": 4
  };

  const tabIcons = [SearchRounded, BookmarkBorderRounded, AutoAwesomeRounded, DiamondOutlined, SettingsOutlined];

  const renderTab = (name, index) => {
    const Icon = tabIcons[index];
    return <Tab key={name} label={<><Icon /><span>{name}</span></>} {...tabProps(index)} />;
  };

  return (
    <div className="App">
      <VersionUpdater />
      <nav className="app-navigation" aria-label="Builder navigation">
        <div className="app-brand" aria-label="MHW Builder">
          <span className="app-brand-mark"><span /><span /><span /></span>
          <span className="app-brand-copy"><strong>MHW Builder</strong><small>Wilds set planner</small></span>
        </div>
        <Tabs value={tab} onChange={handleTabChange} aria-label="tabs" variant="scrollable"
          allowScrollButtonsMobile className="tab-root">
          {Object.entries(tabs).map(([name, index]) => renderTab(name, index))}
        </Tabs>
      </nav>
      <header className="workspace-masthead">
        <div className="workspace-brand">
          <span className="workspace-brand-mark"><span /><span /><span /></span>
          <span><strong>MHW Builder</strong><small>Monster Hunter Wilds</small></span>
        </div>
        <div className="workspace-status"><span /> Build planner</div>
      </header>
      <SharedSetImportDialog onClose={dismissSharedSetPreview} result={sharedSetPreview} />
      <CustomTabPanel value={tab} index={0}><Search /></CustomTabPanel>
      <CustomTabPanel value={tab} index={1}>
        <SavedSets />
      </CustomTabPanel>
      <CustomTabPanel value={tab} index={2}><DecoInventory /></CustomTabPanel>
      <CustomTabPanel value={tab} index={3}><CharmCreator /></CustomTabPanel>
      <CustomTabPanel value={tab} index={4}><Settings /></CustomTabPanel>
    </div>
  );
};

export default App;
