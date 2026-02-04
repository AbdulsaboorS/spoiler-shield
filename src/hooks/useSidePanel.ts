import { useState, useEffect } from 'react';

/**
 * Hook to detect if the app is running in Chrome side panel mode.
 * Checks for the 'sidepanel' class on document.documentElement.
 */
export function useSidePanel(): boolean {
  const [isSidePanel, setIsSidePanel] = useState(() => 
    document.documentElement.classList.contains('sidepanel')
  );

  useEffect(() => {
    // Watch for class changes (in case it's added/removed dynamically)
    const observer = new MutationObserver(() => {
      setIsSidePanel(document.documentElement.classList.contains('sidepanel'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return isSidePanel;
}
