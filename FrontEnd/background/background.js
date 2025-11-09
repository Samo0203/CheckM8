chrome.runtime.onInstalled.addListener(() => {
  console.log("Lichess Arrow Enhancer installed!");
});

chrome.action.onClicked.addListener((tab) => {
  console.log("Extension icon clicked:", tab.url);
});
