export function navigateWithVideoState(currentPage: string, targetUrl: string) {
  // Set session storage immediately and synchronously
  sessionStorage.setItem('currentPage', currentPage);
  console.log(`🎬 Navigation: Set current page to '${currentPage}' before navigating to ${targetUrl}`);
  
  // Force a small delay to ensure session storage is persisted
  setTimeout(() => {
    window.location.href = targetUrl;
  }, 50);
}

export function navigateWithRouterAndVideoState(currentPage: string, setLocation: (path: string) => void, targetPath: string) {
  console.log(`🚀🚀🚀 NAVIGATION FUNCTION CALLED: navigateWithRouterAndVideoState 🚀🚀🚀`);
  console.log(`🎬 Navigation: currentPage=${currentPage}, targetPath=${targetPath}`);
  
  // Set a navigation flag to indicate we're coming from a specific page
  const navigationFlag = `navigating-from-${currentPage}`;
  sessionStorage.setItem('navigationSource', currentPage);
  sessionStorage.setItem('currentPage', currentPage);
  console.log(`🎬 Navigation: Set navigation source to '${currentPage}' before navigating to ${targetPath}`);
  
  // Additional debug logging
  console.log(`🎬 Navigation: Session storage after setting:`, sessionStorage.getItem('currentPage'));
  console.log(`🎬 Navigation: Navigation source:`, sessionStorage.getItem('navigationSource'));
  console.log(`🎬 Navigation: All session storage keys:`, Object.keys(sessionStorage));
  console.log(`🎬 Navigation: Session storage length:`, sessionStorage.length);
  
  // Force session storage to flush by reading it back multiple times
  const verifyStorage = sessionStorage.getItem('currentPage');
  const verifyNavSource = sessionStorage.getItem('navigationSource');
  console.log(`🎬 Navigation: Verification read returns:`, verifyStorage);
  console.log(`🎬 Navigation: Verification nav source:`, verifyNavSource);
  
  // Force multiple reads to ensure storage is persisted
  for (let i = 0; i < 3; i++) {
    const check = sessionStorage.getItem('currentPage');
    const navCheck = sessionStorage.getItem('navigationSource');
    console.log(`🎬 Navigation: Check ${i + 1}: ${check}, navSource: ${navCheck}`);
  }
  
  // Use a slightly longer delay to ensure storage is completely written
  setTimeout(() => {
    console.log(`🎬 Navigation: Final session storage check before navigation:`, sessionStorage.getItem('currentPage'));
    console.log(`🎬 Navigation: Final nav source check:`, sessionStorage.getItem('navigationSource'));
    console.log(`🎬 Navigation: About to navigate to ${targetPath}`);
    setLocation(targetPath);
  }, 100);
}