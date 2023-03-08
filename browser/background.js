"use strict";
chrome.browserAction.onClicked.addListener(async (tab) => {
    if (tab.id != undefined) {
        await chrome.tabs.executeScript(tab.id, { file: 'content-script.js' });
    }
});
