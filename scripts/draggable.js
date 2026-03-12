// scripts/draggable.js
// Function to make .tabs-container elements horizontally draggable
function makeTabsContainerDraggable(tabsContainer) {
  if (!tabsContainer || tabsContainer.dataset.draggable === 'true') return;
  tabsContainer.dataset.draggable = 'true';
  tabsContainer.style.cursor = 'grab';

  let isDown = false;
  let startX;
  let scrollLeft;

  tabsContainer.addEventListener('mousedown', (e) => {
    isDown = true;
    tabsContainer.style.cursor = 'grabbing';
    startX = e.pageX - tabsContainer.offsetLeft;
    scrollLeft = tabsContainer.scrollLeft;
    e.preventDefault();
  });

  tabsContainer.addEventListener('mouseleave', () => {
    isDown = false;
    tabsContainer.style.cursor = 'grab';
  });

  tabsContainer.addEventListener('mouseup', () => {
    isDown = false;
    tabsContainer.style.cursor = 'grab';
  });

  tabsContainer.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    const x = e.pageX - tabsContainer.offsetLeft;
    const walk = (x - startX) * 2;
    tabsContainer.scrollLeft = scrollLeft - walk;
  });

  tabsContainer.addEventListener('touchstart', (e) => {
    isDown = true;
    startX = e.touches[0].pageX - tabsContainer.offsetLeft;
    scrollLeft = tabsContainer.scrollLeft;
  }, { passive: true });

  tabsContainer.addEventListener('touchend', () => {
    isDown = false;
  });

  tabsContainer.addEventListener('touchmove', (e) => {
    if (!isDown) return;
    const x = e.touches[0].pageX - tabsContainer.offsetLeft;
    const walk = (x - startX) * 2;
    tabsContainer.scrollLeft = scrollLeft - walk;
  }, { passive: true });
}

// Observer to apply draggable behavior to dynamic containers
function setupTabsContainerDragObserver() {
  if (window.__jbe_tabsDragObserverInited) return;
  window.__jbe_tabsDragObserverInited = true;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const list = node.classList && node.classList.contains('tabs-container') ?
              [node] : node.querySelectorAll('.tabs-container');
            list.forEach(container => makeTabsContainerDraggable(container));
          }
        });
      }
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll('.tabs-container').forEach(makeTabsContainerDraggable);
} 