// 地図の初期化
let map;
let userLocation = null;
let trafficMarkers = [];
let currentFilter = 'all';
let currentFullscreenMode = null;

// 地図の初期化
function initMap() {
    // デフォルトは東京を中心に
    map = L.map('map').setView([35.6812, 139.7671], 10);

    // ダークテーマの地図タイル
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // カスタムアイコンの定義
    window.trafficIcons = {
        congestion: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #ef4444; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.5);"><span style="color: white; font-size: 18px;">🚗</span></div>',
            iconSize: [30, 30]
        }),
        restriction: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #3b82f6; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.5);"><span style="color: white; font-size: 18px;">🚧</span></div>',
            iconSize: [30, 30]
        }),
        accident: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #8b5cf6; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.5);"><span style="color: white; font-size: 18px;">⚠️</span></div>',
            iconSize: [30, 30]
        }),
        warning: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #f59e0b; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.5);"><span style="color: white; font-size: 18px;">⚡</span></div>',
            iconSize: [30, 30]
        }),
        traffic: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #10b981; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.5);"><span style="color: white; font-size: 18px;">📊</span></div>',
            iconSize: [30, 30]
        })
    };
}

// 国土交通省交通量APIからデータを取得
async function fetchTrafficDataFromAPI() {
    try {
        // 国土交通省交通量APIのエンドポイント
        const baseUrl = 'https://api.jartic-open-traffic.org/geoserver/wfs';

        // 5分間交通量データを取得
        const params = new URLSearchParams({
            service: 'WFS',
            version: '2.0.0',
            request: 'GetFeature',
            typeName: 'traffic:traffic_5min',
            outputFormat: 'application/json',
            srsName: 'EPSG:4326'
        });

        const response = await fetch(`${baseUrl}?${params}`);

        if (!response.ok) {
            throw new Error('API request failed');
        }

        const data = await response.json();
        return processAPIData(data);
    } catch (error) {
        console.error('APIからのデータ取得に失敗しました:', error);
        console.log('サンプルデータを使用します');
        return generateSampleTrafficData();
    }
}

// APIデータを処理
function processAPIData(geoJsonData) {
    const trafficData = [];

    if (!geoJsonData.features || geoJsonData.features.length === 0) {
        return generateSampleTrafficData();
    }

    geoJsonData.features.forEach((feature, index) => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;

        // 交通量から渋滞状況を判定
        const trafficVolume = props.traffic_volume || 0;
        let type = 'traffic';
        let description = `交通量: ${trafficVolume}台/5分`;

        if (trafficVolume > 100) {
            type = 'congestion';
            description = `渋滞が発生しています。交通量: ${trafficVolume}台/5分`;
        } else if (trafficVolume > 50) {
            type = 'warning';
            description = `混雑しています。交通量: ${trafficVolume}台/5分`;
        }

        trafficData.push({
            id: `api-${index}`,
            type: type,
            category: props.road_type === 'highway' ? 'highway' : 'local',
            title: props.road_name || `観測地点 ${index + 1}`,
            location: props.location || '位置情報なし',
            description: description,
            lat: coords[1],
            lng: coords[0],
            timestamp: new Date(props.observation_time || Date.now())
        });
    });

    return trafficData;
}

// サンプルの交通情報データ（APIが使えない場合のフォールバック）
function generateSampleTrafficData(userLat = 35.6812, userLng = 139.7671) {
    const highways = [
        { name: '東名高速道路', section: '東京IC - 横浜IC' },
        { name: '中央自動車道', section: '高井戸IC - 調布IC' },
        { name: '関越自動車道', section: '練馬IC - 所沢IC' },
        { name: '東北自動車道', section: '川口JCT - 浦和IC' },
        { name: '常磐自動車道', section: '三郷IC - 流山IC' },
        { name: '首都高速道路', section: 'C1都心環状線' },
        { name: '京葉道路', section: '市川IC - 船橋IC' },
        { name: '外環自動車道', section: '大泉JCT - 和光IC' }
    ];

    const localRoads = [
        { name: '国道246号', section: '渋谷 - 三軒茶屋' },
        { name: '国道1号', section: '品川 - 川崎' },
        { name: '環状7号線', section: '板橋 - 練馬' },
        { name: '環状8号線', section: '世田谷 - 杉並' },
        { name: '甲州街道', section: '新宿 - 調布' },
        { name: '青梅街道', section: '中野 - 立川' }
    ];

    const types = ['congestion', 'restriction', 'accident', 'warning'];
    const trafficData = [];

    // 高速道路の情報
    highways.forEach((highway, index) => {
        const type = types[Math.floor(Math.random() * types.length)];
        const lat = userLat + (Math.random() - 0.5) * 0.5;
        const lng = userLng + (Math.random() - 0.5) * 0.5;

        trafficData.push({
            id: `highway-${index}`,
            type: type,
            category: 'highway',
            title: highway.name,
            location: highway.section,
            description: getDescriptionByType(type),
            lat: lat,
            lng: lng,
            timestamp: new Date()
        });
    });

    // 一般道路の情報
    localRoads.forEach((road, index) => {
        const type = types[Math.floor(Math.random() * types.length)];
        const lat = userLat + (Math.random() - 0.5) * 0.3;
        const lng = userLng + (Math.random() - 0.5) * 0.3;

        trafficData.push({
            id: `local-${index}`,
            type: type,
            category: 'local',
            title: road.name,
            location: road.section,
            description: getDescriptionByType(type),
            lat: lat,
            lng: lng,
            timestamp: new Date()
        });
    });

    return trafficData;
}

function getDescriptionByType(type) {
    const descriptions = {
        congestion: '渋滞が発生しています。通過に時間がかかる見込みです。',
        restriction: '車線規制が実施されています。注意して走行してください。',
        accident: '事故が発生しています。迂回をお勧めします。',
        warning: '気象条件により注意が必要です。',
        traffic: '通常の交通量です。'
    };
    return descriptions[type] || '交通情報があります。';
}

function getTypeLabel(type) {
    const labels = {
        congestion: '渋滞',
        restriction: '規制',
        accident: '事故',
        warning: '注意',
        traffic: '通常'
    };
    return labels[type] || '情報';
}

// 交通情報の表示
function displayTrafficInfo(data) {
    const trafficList = document.getElementById('trafficList');
    const filteredData = currentFilter === 'all'
        ? data
        : data.filter(item => item.category === currentFilter);

    if (filteredData.length === 0) {
        trafficList.innerHTML = `
            <div class="loading-state">
                <p>該当する交通情報がありません</p>
            </div>
        `;
        return;
    }

    trafficList.innerHTML = filteredData.map(item => `
        <div class="traffic-item ${item.type}" data-id="${item.id}">
            <div class="traffic-item-header">
                <div class="traffic-item-title">${item.title}</div>
                <div class="traffic-badge ${item.type}">${getTypeLabel(item.type)}</div>
            </div>
            <div class="traffic-item-location">${item.location}</div>
            <div class="traffic-item-description">${item.description}</div>
        </div>
    `).join('');

    // クリックイベントの追加
    document.querySelectorAll('.traffic-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            const trafficItem = data.find(d => d.id === id);
            if (trafficItem) {
                map.setView([trafficItem.lat, trafficItem.lng], 14);
                // マーカーをハイライト
                const marker = trafficMarkers.find(m => m.options.id === id);
                if (marker) {
                    marker.openPopup();
                }
            }
        });
    });

    // 統計の更新
    updateStatistics(data);
}

// 地図にマーカーを追加
function addMarkersToMap(data) {
    // 既存のマーカーをクリア
    trafficMarkers.forEach(marker => marker.remove());
    trafficMarkers = [];

    data.forEach(item => {
        const marker = L.marker([item.lat, item.lng], {
            icon: window.trafficIcons[item.type] || window.trafficIcons.traffic,
            id: item.id
        }).addTo(map);

        marker.bindPopup(`
            <div style="font-family: 'Noto Sans JP', sans-serif; min-width: 200px;">
                <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700;">${item.title}</h3>
                <p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">${item.location}</p>
                <p style="margin: 0; font-size: 12px; color: #888;">${item.description}</p>
                <div style="margin-top: 8px; padding: 4px 8px; background: ${getTypeColor(item.type)}; color: white; border-radius: 4px; font-size: 11px; font-weight: 600; display: inline-block;">
                    ${getTypeLabel(item.type)}
                </div>
            </div>
        `);

        trafficMarkers.push(marker);
    });
}

function getTypeColor(type) {
    const colors = {
        congestion: '#ef4444',
        restriction: '#3b82f6',
        accident: '#8b5cf6',
        warning: '#f59e0b',
        traffic: '#10b981'
    };
    return colors[type] || '#6b7280';
}

// 統計の更新
function updateStatistics(data) {
    const congestionCount = data.filter(item => item.type === 'congestion').length;
    const restrictionCount = data.filter(item => item.type === 'restriction').length;
    const accidentCount = data.filter(item => item.type === 'accident').length;

    document.getElementById('congestionCount').textContent = congestionCount;
    document.getElementById('restrictionCount').textContent = restrictionCount;
    document.getElementById('accidentCount').textContent = accidentCount;
}

// 最終更新時刻の更新
function updateLastUpdateTime() {
    const now = new Date();
    const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    document.getElementById('lastUpdateTime').textContent = timeString;
}

// 現在地の取得
function getUserLocation() {
    if (!navigator.geolocation) {
        alert('お使いのブラウザは位置情報に対応していません。');
        return;
    }

    const locationBtn = document.getElementById('locationBtn');
    locationBtn.disabled = true;
    locationBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
        </svg>
        取得中...
    `;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            map.setView([userLocation.lat, userLocation.lng], 12);

            // 現在地マーカーを追加
            L.marker([userLocation.lat, userLocation.lng], {
                icon: L.divIcon({
                    className: 'custom-marker',
                    html: '<div style="background: #10b981; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.5);"></div>',
                    iconSize: [20, 20]
                })
            }).addTo(map).bindPopup('現在地');

            // 周辺の交通情報を更新
            refreshData();

            locationBtn.disabled = false;
            locationBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="currentColor"/>
                </svg>
                現在地を取得
            `;
        },
        (error) => {
            console.error('位置情報の取得に失敗しました:', error);
            alert('位置情報の取得に失敗しました。ブラウザの設定を確認してください。');

            locationBtn.disabled = false;
            locationBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="currentColor"/>
                </svg>
                現在地を取得
            `;
        }
    );
}

// データの更新
async function refreshData() {
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.disabled = true;

    // ローディング表示
    document.getElementById('trafficList').innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>交通情報を更新中...</p>
        </div>
    `;

    // APIからデータを取得
    const trafficData = await fetchTrafficDataFromAPI();

    displayTrafficInfo(trafficData);
    addMarkersToMap(trafficData);
    updateLastUpdateTime();

    refreshBtn.disabled = false;
}

// フィルターの切り替え
function setupFilters() {
    const filterTabs = document.querySelectorAll('.filter-tab');

    filterTabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            // アクティブ状態の切り替え
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // フィルターの適用
            currentFilter = tab.dataset.filter;

            // データの再表示
            const trafficData = await fetchTrafficDataFromAPI();
            displayTrafficInfo(trafficData);
        });
    });
}

// 全画面モードの切り替え
function setupFullscreenControls() {
    const mapBtn = document.getElementById('fullscreenMapBtn');
    const infoBtn = document.getElementById('fullscreenInfoBtn');
    const allBtn = document.getElementById('fullscreenAllBtn');

    mapBtn.addEventListener('click', () => {
        toggleFullscreenMode('map');
    });

    infoBtn.addEventListener('click', () => {
        toggleFullscreenMode('info');
    });

    allBtn.addEventListener('click', () => {
        toggleFullscreenMode('all');
    });

    // ESCキーで全画面モードを解除
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && currentFullscreenMode) {
            toggleFullscreenMode(null);
        }
    });
}

function toggleFullscreenMode(mode) {
    const body = document.body;
    const mapBtn = document.getElementById('fullscreenMapBtn');
    const infoBtn = document.getElementById('fullscreenInfoBtn');
    const allBtn = document.getElementById('fullscreenAllBtn');

    // すべてのクラスを削除
    body.classList.remove('fullscreen-map', 'fullscreen-info', 'fullscreen-all');
    mapBtn.classList.remove('active');
    infoBtn.classList.remove('active');
    allBtn.classList.remove('active');

    // 同じモードをクリックした場合は解除
    if (currentFullscreenMode === mode) {
        currentFullscreenMode = null;
        // 地図のサイズを再調整
        setTimeout(() => {
            map.invalidateSize();
        }, 300);
        return;
    }

    // 新しいモードを適用
    currentFullscreenMode = mode;

    if (mode === 'map') {
        body.classList.add('fullscreen-map');
        mapBtn.classList.add('active');
    } else if (mode === 'info') {
        body.classList.add('fullscreen-info');
        infoBtn.classList.add('active');
    } else if (mode === 'all') {
        body.classList.add('fullscreen-all');
        allBtn.classList.add('active');
    }

    // 地図のサイズを再調整
    setTimeout(() => {
        map.invalidateSize();
    }, 300);
}

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    setupFilters();
    setupFullscreenControls();

    // 初期データの読み込み
    const trafficData = await fetchTrafficDataFromAPI();
    displayTrafficInfo(trafficData);
    addMarkersToMap(trafficData);
    updateLastUpdateTime();

    // イベントリスナーの設定
    document.getElementById('locationBtn').addEventListener('click', getUserLocation);
    document.getElementById('refreshBtn').addEventListener('click', refreshData);

    // 自動更新（5分ごと）
    setInterval(() => {
        refreshData();
    }, 5 * 60 * 1000);
});
