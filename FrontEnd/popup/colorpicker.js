const colorPicker = document.getElementById("arrowColor");
const saveColorBtn = document.getElementById("saveColorBtn");

chrome.storage.sync.get(["arrowColor"], (result) => {
  if (result.arrowColor) {
    colorPicker.value = result.arrowColor;
  }
});

saveColorBtn.addEventListener("click", () => {
  const color = colorPicker.value;
  chrome.storage.sync.set({ arrowColor: color }, () => {
    showMessage(`Arrow color set to ${color}`);
  });
});

function showMessage(msg) {
  document.getElementById("message").innerText = msg;
}
