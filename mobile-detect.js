(function(){
  const ua = navigator.userAgent || '';
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
    document.documentElement.style.zoom = '25%';
  }
})();