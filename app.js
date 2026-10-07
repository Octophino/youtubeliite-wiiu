// Active Invidious Failover Instances
var API_INSTANCES = [
  'https://yewtu.be',
  'https://inv.nadeko.net',
  'https://invidious.drgns.space',
  'https://invidious.nerdvpn.de'
];

var activeInstanceIdx = 0;
var currentEngine = 'youtube'; // 'youtube' | 'invidious'
var activeVideo = null;

// Persistent Data Stores
var favorites = loadStorage('yt_liite_favs', { videos: [], channels: [] });
var watchHistory = loadStorage('yt_liite_history', []);

// Storage Helpers
function loadStorage(key, fallback) {
  try {
    var data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch(e) {
    return fallback;
  }
}

function saveStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch(e) {}
}

// Navigation Tabs
function switchTab(tabId) {
  var pages = document.querySelectorAll('.view-page');
  for (var i = 0; i < pages.length; i++) {
    pages[i].classList.add('hidden');
  }
  
  var btns = document.querySelectorAll('.nav-btn');
  for (var j = 0; j < btns.length; j++) {
    btns[j].classList.remove('active');
  }

  document.getElementById('view-' + tabId).classList.remove('hidden');
  document.getElementById('tab-' + tabId).classList.add('active');

  if (tabId === 'home') renderHome();
  if (tabId === 'favorites') renderFavorites();
  if (tabId === 'history') renderHistory();
}

// Video Link / ID Extractor
function parseVideoId(input) {
  if (!input) return '';
  input = input.trim();
  if (input.length === 11 && !input.includes('/') && !input.includes('.')) {
    return input;
  }
  var match = input.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
  return (match && match[2].length === 11) ? match[2] : '';
}

function handleQuickPlay() {
  var val = document.getElementById('quick-input').value;
  var id = parseVideoId(val);
  if (id) {
    playVideo({ videoId: id, title: 'Video (' + id + ')', author: 'Unknown' });
  } else {
    alert('Please paste a valid YouTube URL or 11-character Video ID');
  }
}

// DigiView Style Custom Embed
function playVideo(item) {
  activeVideo = item;
  addToHistory(item);

  var section = document.getElementById('player-section');
  var container = document.getElementById('player-container');
  var titleEl = document.getElementById('player-title');
  var channelEl = document.getElementById('player-channel');

  titleEl.innerText = item.title;
  channelEl.innerText = item.author || '';

  renderPlayerFrame();
  updateFavButton();

  section.classList.remove('hidden');
  window.scrollTo(0, 0);
}

function renderPlayerFrame() {
  var container = document.getElementById('player-container');
  var id = activeVideo.videoId;
  var src = '';

  if (currentEngine === 'youtube') {
    // DigiView-styled lightweight youtube embed params
    src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&modestbranding=1&rel=0&iv_load_policy=3';
  } else {
    src = API_INSTANCES[activeInstanceIdx] + '/embed/' + id + '?autoplay=1';
  }

  container.innerHTML = '<iframe src="' + src + '" allowfullscreen></iframe>';
}

function cycleEngine() {
  currentEngine = (currentEngine === 'youtube') ? 'invidious' : 'youtube';
  document.getElementById('engine-name').innerText = (currentEngine === 'youtube') ? 'YouTube' : 'Invidious';
  if (activeVideo) renderPlayerFrame();
}

function closePlayer() {
  document.getElementById('player-container').innerHTML = '';
  document.getElementById('player-section').classList.add('hidden');
  activeVideo = null;
}

// Search System with Multi-Instance API Fallback
function executeSearch() {
  var query = document.getElementById('search-query').value.trim();
  if (!query) return;

  var directId = parseVideoId(query);
  if (directId) {
    playVideo({ videoId: directId, title: 'Direct Link Video', author: '' });
    return;
  }

  var type = document.getElementById('search-type').value;
  var statusEl = document.getElementById('search-status');
  statusEl.innerText = 'Searching...';
  document.getElementById('search-results-grid').innerHTML = '';

  fetchSearchWithFailover(query, type, 0);
}

function fetchSearchWithFailover(query, type, attempt) {
  var statusEl = document.getElementById('search-status');

  if (attempt >= API_INSTANCES.length) {
    statusEl.innerText = 'Search failed on all instances. Paste a direct video link above to play.';
    return;
  }

  var instance = API_INSTANCES[attempt];
  var url = instance + '/api/v1/search?q=' + encodeURIComponent(query) + '&type=' + type;

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.timeout = 5000;

  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        var data = JSON.parse(xhr.responseText);
        activeInstanceIdx = attempt;
        statusEl.innerText = '';
        renderSearchResults(data, type);
      } catch(e) {
        fetchSearchWithFailover(query, type, attempt + 1);
      }
    } else {
      fetchSearchWithFailover(query, type, attempt + 1);
    }
  };

  xhr.onerror = function() { fetchSearchWithFailover(query, type, attempt + 1); };
  xhr.ontimeout = function() { fetchSearchWithFailover(query, type, attempt + 1); };
  xhr.send();
}

function renderSearchResults(items, type) {
  var grid = document.getElementById('search-results-grid');
  grid.innerHTML = '';

  for (var i = 0; i < Math.min(items.length, 12); i++) {
    var item = items[i];
    if (type === 'video' && item.type === 'video') {
      grid.appendChild(createVideoCard({
        videoId: item.videoId,
        title: item.title,
        author: item.author,
        thumb: item.videoThumbnails ? item.videoThumbnails[0].url : ''
      }));
    } else if (type === 'channel' && item.type === 'channel') {
      grid.appendChild(createChannelCard({
        authorId: item.authorId,
        author: item.author,
        thumb: item.authorThumbnails ? item.authorThumbnails[0].url : ''
      }));
    }
  }
}

// Card UI Builders
function createVideoCard(video) {
  var card = document.createElement('div');
  card.className = 'card';
  card.onclick = function() { playVideo(video); };

  card.innerHTML = 
    '<img class="card-thumb" src="' + (video.thumb || '') + '" alt="thumb">' +
    '<div class="card-body">' +
      '<div class="card-title">' + escapeHtml(video.title) + '</div>' +
      '<div class="card-channel">' + escapeHtml(video.author) + '</div>' +
    '</div>';
  return card;
}

function createChannelCard(channel) {
  var card = document.createElement('div');
  card.className = 'card';
  card.onclick = function() {
    toggleChannelFavorite(channel);
  };

  card.innerHTML = 
    '<img class="card-thumb" src="' + (channel.thumb || '') + '" alt="thumb">' +
    '<div class="card-body">' +
      '<div class="card-title">' + escapeHtml(channel.author) + '</div>' +
      '<div class="card-channel">Tap to Favorite Channel</div>' +
    '</div>';
  return card;
}

// History & Favorites Management
function addToHistory(item) {
  watchHistory = watchHistory.filter(function(x) { return x.videoId !== item.videoId; });
  watchHistory.unshift(item);
  if (watchHistory.length > 30) watchHistory.pop();
  saveStorage('yt_liite_history', watchHistory);
}

function clearHistory() {
  watchHistory = [];
  saveStorage('yt_liite_history', watchHistory);
  renderHistory();
}

function toggleCurrentFavorite() {
  if (!activeVideo) return;
  var idx = -1;
  for (var i = 0; i < favorites.videos.length; i++) {
    if (favorites.videos[i].videoId === activeVideo.videoId) {
      idx = i;
      break;
    }
  }

  if (idx >= 0) {
    favorites.videos.splice(idx, 1);
  } else {
    favorites.videos.unshift(activeVideo);
  }

  saveStorage('yt_liite_favs', favorites);
  updateFavButton();
}

function toggleChannelFavorite(channel) {
  var idx = -1;
  for (var i = 0; i < favorites.channels.length; i++) {
    if (favorites.channels[i].authorId === channel.authorId) {
      idx = i;
      break;
    }
  }

  if (idx >= 0) {
    favorites.channels.splice(idx, 1);
    alert('Removed channel from favorites');
  } else {
    favorites.channels.unshift(channel);
    alert('Added channel to favorites!');
  }

  saveStorage('yt_liite_favs', favorites);
}

function updateFavButton() {
  if (!activeVideo) return;
  var btn = document.getElementById('btn-toggle-fav');
  var isFav = favorites.videos.some(function(x) { return x.videoId === activeVideo.videoId; });
  btn.innerText = isFav ? '★ Favorited' : '☆ Favorite';
}

// Render Page Sections
function renderHome() {
  var favGrid = document.getElementById('home-favorites-grid');
  var histGrid = document.getElementById('home-history-grid');

  favGrid.innerHTML = favorites.videos.length ? '' : '<div style="color:#888; padding:10px;">No favorites added yet.</div>';
  for (var i = 0; i < Math.min(favorites.videos.length, 3); i++) {
    favGrid.appendChild(createVideoCard(favorites.videos[i]));
  }

  histGrid.innerHTML = watchHistory.length ? '' : '<div style="color:#888; padding:10px;">No watch history yet.</div>';
  for (var j = 0; j < Math.min(watchHistory.length, 3); j++) {
    histGrid.appendChild(createVideoCard(watchHistory[j]));
  }
}

function renderFavorites() {
  var vGrid = document.getElementById('fav-videos-grid');
  var cGrid = document.getElementById('fav-channels-grid');

  vGrid.innerHTML = favorites.videos.length ? '' : '<div style="color:#888; padding:10px;">No favorite videos.</div>';
  for (var i = 0; i < favorites.videos.length; i++) {
    vGrid.appendChild(createVideoCard(favorites.videos[i]));
  }

  cGrid.innerHTML = favorites.channels.length ? '' : '<div style="color:#888; padding:10px;">No favorite channels.</div>';
  for (var j = 0; j < favorites.channels.length; j++) {
    cGrid.appendChild(createChannelCard(favorites.channels[j]));
  }
}

function switchFavSubtab(type) {
  document.getElementById('subtab-fav-videos').className = 'sub-btn' + (type === 'videos' ? ' active' : '');
  document.getElementById('subtab-fav-channels').className = 'sub-btn' + (type === 'channels' ? ' active' : '');

  document.getElementById('fav-videos-grid').className = 'cards-grid' + (type === 'videos' ? '' : ' hidden');
  document.getElementById('fav-channels-grid').className = 'cards-grid' + (type === 'channels' ? '' : ' hidden');
}

function renderHistory() {
  var grid = document.getElementById('history-grid');
  grid.innerHTML = watchHistory.length ? '' : '<div style="color:#888; padding:10px;">No watch history yet.</div>';
  for (var i = 0; i < watchHistory.length; i++) {
    grid.appendChild(createVideoCard(watchHistory[i]));
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Initial Load
window.onload = function() {
  renderHome();
};
