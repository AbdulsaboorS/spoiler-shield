// Extension popup: provides fallback UX to open side panel or web app

const openSidePanelBtn = document.getElementById("openSidePanel");
const openWebAppBtn = document.getElementById("openWebApp");
const errorDiv = document.getElementById("error");

function showError(message) {
  errorDiv.textContent = message;
  errorDiv.classList.add("show");
  setTimeout(() => {
    errorDiv.classList.remove("show");
  }, 5000);
}

async function openSidePanel() {
  try {
    // Get the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs?.[0]?.id;
    
    if (!tabId) {
      showError("No active tab found");
      return;
    }

    // Set side panel options for this tab
    if (chrome.sidePanel?.setOptions) {
      await chrome.sidePanel.setOptions({
        tabId,
        path: "sidepanel.html",
        enabled: true,
      });
    }

    // Open the side panel
    if (chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ tabId });
      window.close(); // Close popup after opening side panel
    } else {
      showError("Side panel not supported — use the panel menu");
    }
  } catch (error) {
    showError("Side panel not supported — use the panel menu");
  }
}

function openWebApp() {
  chrome.tabs.create({ url: "http://localhost:8080/" });
  window.close(); // Close popup after opening web app
}

openSidePanelBtn.addEventListener("click", openSidePanel);
openWebAppBtn.addEventListener("click", openWebApp);
