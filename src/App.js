import { useState, useEffect } from "react";
import "./App.css";
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Search from "./components/Search";
import CustomTabPanel from "./components/CustomTabPanel";
import SavedSets from "./components/SavedSets";
import DecoInventory from "./components/DecoInventory";
import CharmCreator from "./components/CharmCreator";
import Settings from "./components/Settings";
import { DEBUG } from "./util/constants";
import { runAllTests } from "./util/logic";
import { useStorage } from "./hooks/StorageContext";
// import { compareArmor } from "./util/kiranico";

const App = () => {
  const { swapTab, setSwapTab } = useStorage();
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (DEBUG) {
      window.runAllTests = runAllTests;
      // compareArmor();
    }
  }, []);

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

  const renderTab = (name, index) => {
    return <Tab key={name} label={name} {...tabProps(index)} />;
  };

  return (
    <div className="App">
      <Tabs value={tab} onChange={handleTabChange} aria-label="tabs" variant="scrollable"
        allowScrollButtonsMobile className="tab-root">
        {Object.entries(tabs).map(([name, index]) => renderTab(name, index))}
      </Tabs>
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
