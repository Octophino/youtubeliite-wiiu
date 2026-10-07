// Data Stores
var favorites = loadStorage('yt_liite_favs', []);
var watchHistory = loadStorage('yt_liite_history', []);
var activeVideo = null;
var ytPlayer = null;

// The proxy fixes Wii U TLS connection blocks to modern APIs
var CORS_PROXY = 'https://api.allorigins.win/raw?url=';
var SEARCH_API = 'https://yewtu.be/api/v1/search?q=';

function loadStorage(key, fallback) {
  try { var data = localStorage.getItem(key); return data ? JSON.parse(data) : fallback; } 
  catch(e) { return fallback; }
}
function saveStorage(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
}

function switchTab(tabId) {
  var pages = document.querySelectorAll('.view-page');
  for (var i = 0; i < pages.length; i++) pages[i].classList.add('hidden');
  var btns = document.querySelectorAll('.nav-btn');
  for (var j = 0; j < btns.length; j++) btns[j].classList.remove('active');

  document.getElementById('view-' + tabId).classList.remove('hidden');
  document.getElementById('tab-' + tabId).classList.add('active');

  if (tabId === 'home') renderHome();
  if (tabId === 'favorites') renderFavorites();
  if (tabId === 'history') renderHistory();
}

// Fixed Regex to correctly slice out ?si= tracking garbage from share links
function parseVideoId(input) {
  if (!input) return null;
  var match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  return match ? match[1] : (input.trim().length === 11 ? input.trim() : null);
}

// Fetch actual title for a pasted link using YouTube's oEmbed via the proxy
function fetchMetadataAndPlay(id) {
  var url = CORS_PROXY + encodeURIComponent('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + id + '&format=json');
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function() {
    var title = 'Unknown Video';
    var author = 'Unknown Channel';
    if (xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        title = data.title || title;
        author = data.author_name || author;
      } catch(e) {}
    }
    playVideo({ videoId: id, title: title, author: author, thumb: 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg' });
  };
  xhr.onerror = function() {
    playVideo({ videoId: id, title: 'Video (' + id + ')', author: 'Direct Link', thumb: 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg' });
  };
  xhr.send();
}

function handleQuickPlay() {
  var val = document.getElementById('quick-input').value;
  var id = parseVideoId(val);
  if (id) {
    document.getElementById('quick-input').value = '';
    fetchMetadataAndPlay(id);
  } else {
    alert('Invalid link format.');
  }
}

// CUSTOM PLAYER API INTEGRATION (Controls = 0)
function onYouTubeIframeAPIReady() {
  // API is ready to construct custom players
}

function playVideo(item) {
  activeVideo = item;
  addToHistory(item);

  document.getElementById('player-title').innerText = item.title;
  document.getElementById('player-channel').innerText = item.author;
  document.getElementById('player-section').classList.remove('hidden');
  window.scrollTo(0, 0);

  if (ytPlayer) {
    ytPlayer.loadVideoById(item.videoId);
  } else {
    ytPlayer = new YT.Player('player-container', {
      videoId: item.videoId,
      playerVars: {
        'controls': 0,          // Hides all YouTube UI
        'disablekb': 1,         // Disables keyboard shortcuts
        'modestbranding': 1,    // Hides logos
        'rel': 0,               // Disables related videos
        'iv_load_policy': 3     // Hides annotations
      },
      events: {
        'onReady': function(event) { event.target.playVideo(); }
      }
    });
  }
  updateFavButton();
}

// Custom Video Controls functions
function ctrlPlay() { if (ytPlayer && ytPlayer.playVideo) ytPlayer.playVideo(); }
function ctrlPause() { if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo(); }
function ctrlStop() { if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo(); }
function ctrlMute() { 
  if (ytPlayer && ytPlayer.isMuted) {
    if (ytPlayer.isMuted()) ytPlayer.unMute(); else ytPlayer.mute();
  }
}

function closePlayer() {
  if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
  document.getElementById('player-section').classList.add('hidden');
  activeVideo = null;
}

// Search using Proxy to bypass TLS blocks
function executeSearch() {
  var query = document.getElementById('search-query').value.trim();
  if (!query) return;

  var directId = parseVideoId(query);
  if (directId) { fetchMetadataAndPlay(directId); return; }

  var statusEl = document.getElementById('search-status');
  statusEl.innerText = 'Searching...';
  document.getElementById('search-results-grid').innerHTML = '';

  var url = CORS_PROXY + encodeURIComponent(SEARCH_API + query);
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        var data = JSON.parse(xhr.responseText);
        statusEl.innerText = '';
        renderSearchResults(data);
      } catch(e) { statusEl.innerText = 'Error parsing data.'; }
    } else {
      statusEl.innerText = 'Network error. Proxy failed.';
    }
  };
  xhr.onerror = function() { statusEl.innerText = 'Connection blocked by browser.'; };
  xhr.send();
}

function renderSearchResults(items) {
  var grid = document.getElementById('search-results-grid');
  grid.innerHTML = '';
  for (var i = 0; i < Math.min(items.length, 12); i++) {
    var item = items[i];
    if (item.type === 'video') {
      var thumbUrl = item.videoThumbnails ? item.videoThumbnails[0].url : ('https://img.youtube.com/vi/' + item.videoId + '/hqdefault.jpg');
      grid.appendChild(createVideoCard({
        videoId: item.videoId, title: item.title, author: item.author, thumb: thumbUrl
      }));
    }
  }
}

function createVideoCard(video) {
  var card = document.createElement('div');
  card.className = 'card';
  card.onclick = function() { playVideo(video); };
  card.innerHTML = 
    '<img class="card-thumb" src="' + video.thumb + '">' +
    '<div class="card-body">' +
      '<div class="card-title">' + escapeHtml(video.title) + '</div>' +
      '<div class="card-channel">' + escapeHtml(video.author) + '</div>' +
    '</div>';
  return card;
}

function addToHistory(item) {
  watchHistory = watchHistory.filter(function(x) { return x.videoId !== item.videoId; });
  watchHistory.unshift(item);
  if (watchHistory.length > 30) watchHistory.pop();
  saveStorage('yt_liite_history', watchHistory);
}

function clearHistory() {
  watchHistory = []; saveStorage('yt_liite_history', watchHistory); renderHistory();
}

function toggleCurrentFavorite() {
  if (!activeVideo) return;
  var idx = -1;
  for (var i = 0; i < favorites.length; i++) {
    if (favorites[i].videoId === activeVideo.videoId) { idx = i; break; }
  }
  if (idx >= 0) favorites.splice(idx, 1);
  else favorites.unshift(activeVideo);

  saveStorage('yt_liite_favs', favorites);
  updateFavButton();
}

function updateFavButton() {
  var btn = document.getElementById('btn-toggle-fav');
  var isFav = false;
  if (activeVideo) {
    for (var i = 0; i < favorites.length; i++) {
      if (favorites[i].videoId === activeVideo.videoId) { isFav = true; break; }
    }
  }
  btn.innerText = isFav ? '[ REMOVE FAV ]' : '[ ADD FAV ]';
  btn.style.background = isFav ? '#dd3333' : '#ffaa00';
}

function renderHome() {
  var fg = document.getElementById('home-favorites-grid'); fg.innerHTML = '';
  for (var i = 0; i < Math.min(favorites.length, 3); i++) fg.appendChild(createVideoCard(favorites[i]));
  var hg = document.getElementById('home-history-grid'); hg.innerHTML = '';
  for (var j = 0; j < Math.min(watchHistory.length, 3); j++) hg.appendChild(createVideoCard(watchHistory[j]));
}

function renderFavorites() {
  var grid = document.getElementById('fav-videos-grid'); grid.innerHTML = '';
  for (var i = 0; i < favorites.length; i++) grid.appendChild(createVideoCard(favorites[i]));
}

function renderHistory() {
  var grid = document.getElementById('history-grid'); grid.innerHTML = '';
  for (var i = 0; i < watchHistory.length; i++) grid.appendChild(createVideoCard(watchHistory[i]));
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>'"]/g, function(tag) {
    var chars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
    return chars[tag] || tag;
  });
}

window.onload = function() { switchTab('home'); };
