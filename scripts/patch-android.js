const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const LOGO_URL = 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEil2dds7gIHlc-jR_PV41bR6HiwYzt4n7ciZhiP8KlTlWXXIyZrrYzCYP1UwpK-bLTm6eI4Rpvhvaq3Z-7l5qIyR-BuJnDIi_SjWJ2dWcWS31q7zCws74ta2IAa10-ohsOXV44ts5rekRSCpfjoDAAgJcpXnFo2VXljQ2lswxjM6CkdJI1nGq_cqmuGbBg/s512/logo300px.png';

const manifestPath = path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');

const extras = [
  '    <uses-feature android:name="android.software.leanback" android:required="false" />',
  '    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />',
  '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
  '    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />',
  '    <uses-permission android:name="android.permission.WAKE_LOCK" />'
].filter(line => !manifest.includes(line.match(/android:name="([^"]+)"/)[1]));

if (extras.length) {
  manifest = manifest.replace('<application', extras.join('\n') + '\n\n    <application');
}
if (!manifest.includes('android:usesCleartextTraffic')) {
  manifest = manifest.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
}
if (!manifest.includes('android:hardwareAccelerated')) {
  manifest = manifest.replace('<application', '<application\n        android:hardwareAccelerated="true"');
}
if (!manifest.includes('android:largeHeap')) {
  manifest = manifest.replace('<application', '<application\n        android:largeHeap="true"');
}
if (!manifest.includes('android:banner')) {
  manifest = manifest.replace('<application', '<application\n        android:banner="@drawable/tv_banner"');
} else {
  manifest = manifest.replace(/android:banner="[^"]*"/, 'android:banner="@drawable/tv_banner"');
}
if (!manifest.includes('LEANBACK_LAUNCHER')) {
  manifest = manifest.replace(
    '<category android:name="android.intent.category.LAUNCHER" />',
    '<category android:name="android.intent.category.LAUNCHER" />\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />'
  );
}

fs.writeFileSync(manifestPath, manifest, 'utf8');
console.log('AndroidManifest.xml actualizado para Android TV / TV Box.');

const mainActivityPath = path.join('android', 'app', 'src', 'main', 'java', 'com', 'kikeflix', 'tv', 'MainActivity.java');
fs.mkdirSync(path.dirname(mainActivityPath), { recursive: true });

const mainActivityJava = `package com.kikeflix.tv;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private boolean appInForeground = false;
    private boolean audioPlaybackActive = false;
    private long lastBackPressMs = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.setKeepScreenOn(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            }

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);

            CookieManager cm = CookieManager.getInstance();
            cm.setAcceptCookie(true);
            cm.setAcceptThirdPartyCookies(webView, true);

            webView.addJavascriptInterface(new AndroidAudioBridge(), "AndroidAudio");
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                if (wv == null) {
                    finish();
                    return;
                }
                String checkJs =
                    "(function(){" +
                    "  if(document.body.classList.contains('tv-vip-fs-on') && typeof window.kfCanalesVipExitFullscreen === 'function'){" +
                    "    window.kfCanalesVipExitFullscreen(); return '1';" +
                    "  }" +
                    "  var fs = document.body.classList.contains('tv-18-fs-on') ||" +
                    "           document.body.classList.contains('tv-music-fs-on') ||" +
                    "           !!document.querySelector('#seccion-3.tv-ch-fs-on');" +
                    "  var p = document.getElementById('player-screen');" +
                    "  var m = document.getElementById('modal');" +
                    "  var km = document.getElementById('kf-modal-overlay');" +
                    "  var scr = document.querySelector('.app-screen:not([hidden])');" +
                    "  var menu = document.getElementById('menu-desplegable');" +
                    "  var handled = !!(fs ||" +
                    "    (p && !p.hidden) ||" +
                    "    (m && m.classList.contains('open')) ||" +
                    "    (km && km.classList.contains('activo')) ||" +
                    "    (menu && getComputedStyle(menu).display !== 'none') ||" +
                    "    (scr && scr.id !== 'screen-home'));" +
                    "  if(handled){" +
                    "    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true}));" +
                    "  }" +
                    "  return handled ? '1' : '0';" +
                    "})()";

                wv.evaluateJavascript(checkJs, value -> {
                    if ("\\"1\\"".equals(value)) {
                        return;
                    }
                    long now = System.currentTimeMillis();
                    if (now - lastBackPressMs < 2000L) {
                        finish();
                    } else {
                        lastBackPressMs = now;
                        Toast.makeText(MainActivity.this, "Pulsa Atras otra vez para salir", Toast.LENGTH_SHORT).show();
                    }
                });
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        appInForeground = true;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        syncLocks();
    }

    @Override
    public void onPause() {
        appInForeground = false;
        syncLocks();
        super.onPause();
    }

    @SuppressWarnings("deprecation")
    private void syncLocks() {
        boolean needWifi = appInForeground || audioPlaybackActive;
        boolean needPartialWake = audioPlaybackActive;

        try {
            if (needWifi) {
                if (wifiLock == null) {
                    WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    if (wm != null) {
                        int wifiMode = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                            ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                            : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                        wifiLock = wm.createWifiLock(wifiMode, "KikeFlix:StreamingWifiLock");
                        wifiLock.setReferenceCounted(false);
                    }
                }
                if (wifiLock != null && !wifiLock.isHeld()) {
                    wifiLock.acquire();
                }
            } else {
                if (wifiLock != null && wifiLock.isHeld()) {
                    wifiLock.release();
                }
            }
        } catch (Exception ignored) {}

        try {
            if (needPartialWake) {
                if (wakeLock == null) {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "KikeFlix:AudioWakeLock");
                        wakeLock.setReferenceCounted(false);
                    }
                }
                if (wakeLock != null && !wakeLock.isHeld()) {
                    wakeLock.acquire();
                }
            } else {
                if (wakeLock != null && wakeLock.isHeld()) {
                    wakeLock.release();
                }
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        appInForeground = false;
        audioPlaybackActive = false;
        syncLocks();
        super.onDestroy();
    }

    public class AndroidAudioBridge {
        @JavascriptInterface
        public void iniciar(String titulo, String artista, String artwork) {
            runOnUiThread(() -> {
                audioPlaybackActive = true;
                syncLocks();
            });
        }

        @JavascriptInterface
        public void pausar() {
            runOnUiThread(() -> {
                audioPlaybackActive = false;
                syncLocks();
            });
        }

        @JavascriptInterface
        public void detener() {
            runOnUiThread(() -> {
                audioPlaybackActive = false;
                syncLocks();
            });
        }
    }
}
`;

fs.writeFileSync(mainActivityPath, mainActivityJava, 'utf8');
console.log('MainActivity.java actualizado OK.');

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadBuffer(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode + ' descargando logo'));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function generateIconsAndBanner() {
  console.log('Descargando logo oficial de KikeFlix...');
  const logoBuf = await downloadBuffer(LOGO_URL);
  const logoPath = '/tmp/kikeflix_logo.png';
  fs.writeFileSync(logoPath, logoBuf);

  const resDir = path.join('android', 'app', 'src', 'main', 'res');
  const anydpiDir = path.join(resDir, 'mipmap-anydpi-v26');
  if (fs.existsSync(anydpiDir)) {
    fs.rmSync(anydpiDir, { recursive: true, force: true });
    console.log('Eliminado mipmap-anydpi-v26 por defecto.');
  }

  const pyScript = `
import os
from PIL import Image

RESAMPLE = getattr(Image, 'Resampling', Image).LANCZOS
BG = (5, 7, 14, 255)
logo = Image.open('${logoPath}').convert('RGBA')
res_dir = '${resDir.replace(/\\/g, '/')}'

def fit_center(canvas_w, canvas_h, max_w, max_h):
    ratio = min(max_w / logo.width, max_h / logo.height)
    nw = max(1, int(round(logo.width * ratio)))
    nh = max(1, int(round(logo.height * ratio)))
    resized = logo.resize((nw, nh), RESAMPLE)
    canvas = Image.new('RGBA', (canvas_w, canvas_h), BG)
    canvas.paste(resized, ((canvas_w - nw) // 2, (canvas_h - nh) // 2), resized)
    return canvas, resized

mipmaps = [
    ('mipmap-mdpi', 48),
    ('mipmap-hdpi', 72),
    ('mipmap-xhdpi', 96),
    ('mipmap-xxhdpi', 144),
    ('mipmap-xxxhdpi', 192),
]

for folder, size in mipmaps:
    out_dir = os.path.join(res_dir, folder)
    os.makedirs(out_dir, exist_ok=True)
    inner = int(round(size * 0.78))
    icon, fg = fit_center(size, size, inner, inner)
    icon.save(os.path.join(out_dir, 'ic_launcher.png'))
    icon.save(os.path.join(out_dir, 'ic_launcher_round.png'))
    fg_canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    fg_canvas.paste(fg, ((size - fg.width) // 2, (size - fg.height) // 2), fg)
    fg_canvas.save(os.path.join(out_dir, 'ic_launcher_foreground.png'))

banner, _ = fit_center(320, 180, 220, 130)
for d in ('drawable', 'drawable-xhdpi'):
    d_dir = os.path.join(res_dir, d)
    os.makedirs(d_dir, exist_ok=True)
    banner.save(os.path.join(d_dir, 'tv_banner.png'))

print('Iconos mipmap y banner TV generados OK.')
`;

  const pyFile = '/tmp/gen_icons.py';
  fs.writeFileSync(pyFile, pyScript, 'utf8');

  console.log('Preparando Pillow para generar iconos y banner TV...');
  execSync('python3 -m venv /tmp/pyimg && /tmp/pyimg/bin/pip install --quiet pillow && /tmp/pyimg/bin/python ' + pyFile, {
    stdio: 'inherit'
  });
}

generateIconsAndBanner().catch((err) => {
  console.error(err);
  process.exit(1);
});
