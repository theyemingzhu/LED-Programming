// Run after `pio run`: use the exact pinned ArduinoJson parser with an NVS adapter.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const root = resolve(import.meta.dirname, '..');
const json = resolve(root, '.pio/libdeps/esp32-s3-n16r8/ArduinoJson/src');
assert.ok(existsSync(join(json, 'ArduinoJson.h')), 'run pio build first to install the pinned ArduinoJson dependency');
const source = readFileSync(join(root, 'src/LightweaverStorage.cpp'), 'utf8');
const body = source.slice(source.indexOf('bool saveWifiConfigJson('), source.indexOf('String runtimeStatusJson('));
const dir = mkdtempSync(join(tmpdir(), 'lw-wifi-storage-'));
try {
 writeFileSync(join(dir, 'test.cpp'), `
#include <string>
#include <cassert>
#include <ArduinoJson.h>
#include "${join(root, 'src/LightweaverWifiCredentialPolicy.h')}"
using String = std::string;
struct WifiConfig {String ssid,password,hostname;};
struct RuntimeConfig {WifiConfig wifi;};
static int writes=0;
static bool writeOk=true;
static String stored;
constexpr const char* NVS_NAMESPACE="lightweaver";
constexpr const char* NVS_WIFI_KEY="wifi";
struct Preferences {
 bool begin(const char*, bool){return true;}
 size_t putString(const char*,const String& value){writes++; if(!writeOk)return 0;stored=value;return value.length();}
 void end(){}
};
${body}
int main(){
 RuntimeConfig cfg;cfg.wifi={"Gallery","secret-for-test","my-card"};String message;
 assert(saveWifiConfigJson(R"({"reuseSaved":true})",cfg,message));
 assert(writes==0 && cfg.wifi.password=="secret-for-test");
 assert(saveWifiConfigJson(R"({"ssid":"Gallery","password":""})",cfg,message));
 assert(writes==1 && cfg.wifi.password=="secret-for-test" && cfg.wifi.hostname=="my-card");
 JsonDocument saved;deserializeJson(saved,stored);assert(saved["password"]=="secret-for-test");
 writeOk=false;
 assert(!saveWifiConfigJson(R"({"ssid":"Other","password":"replacement"})",cfg,message));
 assert(cfg.wifi.ssid=="Gallery" && cfg.wifi.password=="secret-for-test");
 writeOk=true;
 assert(saveWifiConfigJson(R"({"ssid":"Other","password":""})",cfg,message));
 assert(cfg.wifi.password.empty());
 cfg.wifi={"Gallery","old-secret","my-card"};
 assert(saveWifiConfigJson(R"({"ssid":"Gallery","password":"typed-but-open","clearPassword":true})",cfg,message));
 assert(cfg.wifi.password.empty());
 assert(!saveWifiConfigJson(R"({"reuseSaved":true,"ssid":"Other"})",cfg,message));
 assert(!saveWifiConfigJson(R"({"ssid":"Gallery","password":null})",cfg,message));
}
`);
 execFileSync('c++', ['-std=c++17','-Wall','-Wextra','-Werror','-I'+json,join(dir,'test.cpp'),'-o',join(dir,'test')]);
 execFileSync(join(dir,'test'));
} finally {rmSync(dir,{recursive:true,force:true});}
console.log('actual saved-network parser/persistence tests passed');
