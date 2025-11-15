chrome.runtime.onInstalled.addListener(() => {
  console.log(" CheckM8 installed!");
});

chrome.action.onClicked.addListener((tab) => {
  console.log("Extension clicked on:", tab.url);
});
