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
import android.os.Bundle;
import android.os.PowerManager;
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
    private long lastBackPressMs = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
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

    @SuppressWarnings("deprecation")
    private void acquireLocks() {
        try {
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
            if (wifiLock == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) {
                    wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "KikeFlix:AudioWifiLock");
                    wifiLock.setReferenceCounted(false);
                }
            }
            if (wifiLock != null && !wifiLock.isHeld()) {
                wifiLock.acquire();
            }
        } catch (Exception ignored) {}
    }

    private void releaseLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {}
        try {
            if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        } catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        releaseLocks();
        super.onDestroy();
    }

    public class AndroidAudioBridge {
        @JavascriptInterface
        public void iniciar(String titulo, String artista, String artwork) {
            runOnUiThread(() -> acquireLocks());
        }

        @JavascriptInterface
        public void pausar() {
            runOnUiThread(() -> releaseLocks());
        }

        @JavascriptInterface
        public void detener() {
            runOnUiThread(() -> releaseLocks());
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

  try {
    require.resolve('sharp');
  } catch (e) {
    console.log('Instalando sharp temporalmente para generar iconos y banner TV...');
    execSync('npm install --no-save sharp', { stdio: 'inherit' });
  }
  const sharp = require('sharp');

  const resDir = path.join('android', 'app', 'src', 'main', 'res');
  const anydpiDir = path.join(resDir, 'mipmap-anydpi-v26');
  if (fs.existsSync(anydpiDir)) {
    fs.rmSync(anydpiDir, { recursive: true, force: true });
    console.log('Eliminado mipmap-anydpi-v26 por defecto.');
  }

  const bg = { r: 5, g: 7, b: 14, alpha: 1 };
  const mipmaps = [
    { dir: 'mipmap-mdpi', size: 48 },
    { dir: 'mipmap-hdpi', size: 72 },
    { dir: 'mipmap-xhdpi', size: 96 },
    { dir: 'mipmap-xxhdpi', size: 144 },
    { dir: 'mipmap-xxxhdpi', size: 192 }
  ];

  for (const m of mipmaps) {
    const outDir = path.join(resDir, m.dir);
    fs.mkdirSync(outDir, { recursive: true });
    const inner = Math.round(m.size * 0.78);
    const resizedLogo = await sharp(logoBuf)
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const iconBuf = await sharp({
      create: { width: m.size, height: m.size, channels: 4, background: bg }
    })
      .composite([{ input: resizedLogo, gravity: 'center' }])
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(outDir, 'ic_launcher.png'), iconBuf);
    fs.writeFileSync(path.join(outDir, 'ic_launcher_round.png'), iconBuf);
    fs.writeFileSync(path.join(outDir, 'ic_launcher_foreground.png'), resizedLogo);
  }
  console.log('Iconos mipmap generados con el logo de KikeFlix.');

  const bannerLogo = await sharp(logoBuf)
    .resize(220, 130, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const bannerBuf = await sharp({
    create: { width: 320, height: 180, channels: 4, background: bg }
  })
    .composite([{ input: bannerLogo, gravity: 'center' }])
    .png()
    .toBuffer();

  for (const d of ['drawable', 'drawable-xhdpi']) {
    const dDir = path.join(resDir, d);
    fs.mkdirSync(dDir, { recursive: true });
    fs.writeFileSync(path.join(dDir, 'tv_banner.png'), bannerBuf);
  }
  console.log('Banner TV (320x180) generado en drawable/tv_banner.png.');
}

generateIconsAndBanner().catch((err) => {
  console.error(err);
  process.exit(1);
});
