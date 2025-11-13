const colorPicker = document.getElementById("arrowColor");
const saveBtn = document.getElementById("saveColorBtn");

chrome.storage.sync.get(["arrowColor"], (res) => {
  if (res.arrowColor) colorPicker.value = res.arrowColor;
});

saveBtn.addEventListener("click", () => {
  chrome.storage.sync.set({ arrowColor: colorPicker.value }, () => {
    showMessage(`Arrow color saved: ${colorPicker.value}`);
  });
});

function showMessage(msg) {
  document.getElementById("message").innerText = msg;
}
