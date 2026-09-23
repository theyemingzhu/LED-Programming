// Execute the production USB parser/dispatcher and line/reason policy with the
// pinned ArduinoJson library and a host radio/NVS adapter; no physical card.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const root = resolve(import.meta.dirname, '..');
const json = join(root, '.pio/libdeps/esp32-s3-n16r8/ArduinoJson/src');
assert.ok(existsSync(join(json, 'ArduinoJson.h')), 'run pio build first to install pinned ArduinoJson');
const web = readFileSync(join(root, 'src/LightweaverWeb.cpp'), 'utf8');
const association = web.slice(web.indexOf('void applyStationAssociation('), web.indexOf('\n}\n\nclass WebConnectivityHardwareAdapter', web.indexOf('void applyStationAssociation(')) + 2);
assert.ok(association.includes('void applyStationAssociation('));
const body = web.slice(web.indexOf('void writeUsbWifiStatus('), web.indexOf('\n}\n\n// The control endpoints', web.indexOf('void writeUsbWifiStatus(')));
assert.ok(body.includes('void handleUsbWifi()'));
const dir = mkdtempSync(join(tmpdir(), 'lw-usb-wifi-'));
try {
 execFileSync('c++', ['-std=c++17','-Wall','-Wextra','-Werror', join(root,'tests/usb-wifi-policy.cpp'),'-o',join(dir,'policy')]);
 execFileSync(join(dir,'policy'));
 writeFileSync(join(dir,'test.cpp'), `
#include <string>
#include <cassert>
#include <cstring>
#include <atomic>
#include <ArduinoJson.h>
#include "${join(root,'src/LightweaverUsbWifiPolicy.h')}"
#include "${join(root,'src/LightweaverConnectivityPolicy.h')}"
#include "${join(root,'src/LightweaverWifiJoinDiagnostics.h')}"
using String=std::string;
using std::max;
constexpr const char* LW_FIRMWARE_VERSION="1.2.3";
constexpr const char* LW_BUILD_ID="abcdef012345678901234567890123456789012345";
constexpr uint32_t LW_BUILD_NUMBER=100;
constexpr int WIFI_SCAN_FAILED=-2,WIFI_SCAN_RUNNING=-1,WIFI_AUTH_OPEN=0,WIFI_STA=1;
constexpr int LW_WIFI_SCAN_MAX_NETWORKS=20;
constexpr uint32_t LW_WIFI_SCAN_RETRY_MS=3000;
struct Config {String pieceId,activeIp,activeHostname;int activeTransport=0;struct {bool proven=false;String hostname;}wifi;struct {
 lightweaver::ConnectivityState connectivity;String stationIp,lastError;bool stationLinkPending=false;
 lightweaver::WifiJoinDiagnostics joinDiagnostics;
}wifiRuntime;}cfg;
using RuntimeConfig=Config;
constexpr int WIFI_TRANSPORT_STATION=1;
Config* runtimeConfigPtr=&cfg;
lightweaver::UsbWifiLineBuffer<1536> usbWifiLine;
uint32_t usbWifiLastByteMs=0,usbWifiAttemptGeneration=0,usbWifiJoinStartAt=0,lastScanStartMs=0;
String usbWifiAttemptId;
std::atomic<uint16_t> usbWifiDisconnectReason{0};
std::atomic<bool> usbWifiObserveDisconnects{false},usbWifiStationStopped{true};
std::atomic<uint16_t> wifiJoinDisconnectReason{0};
std::atomic<bool> wifiJoinSawAssociation{false},wifiJoinObserveEvents{false};
bool wifiJoinFencePending=false;
bool usbWifiJoinFailed=false,knownGood=false,safeMode=false,persistOk=true,pending=false;
uint32_t now=100;
int saves=0,starts=0;
uint32_t millis(){return now;}
String runtimeCardId(){return "lw-001122334455";}
String runtimeBootId(){return "boot-a";}
bool runtimeKnownGoodProject(){return knownGood;}
bool runtimeSafeModeActive(){return safeMode;}
void runtimeSetWifiTransitionPending(bool value){pending=value;}
bool saveWifiConfigJson(const String& value,Config&,String&) {
 JsonDocument d; assert(!deserializeJson(d,value));
 assert(d["password"]=="test-secret" || d["clearPassword"]==true);
 saves++;return persistOk;
}
void beginStationJoin(Config& c,uint32_t g){starts++;c.wifiRuntime.connectivity.generation=g;c.wifiRuntime.connectivity.phase=lightweaver::ConnectivityPhase::Joining;}
struct Radio {
 int mode=0;int scanComplete(){return 3;}void scanDelete(){}void scanNetworks(bool,bool){}
 String SSID(int i){return i==1?"Gallery":"Other";}int RSSI(int i){return -30-i;}
 int encryptionType(int){return 1;}int getMode(){return mode;}void enableSTA(bool){mode=0;}
 void setAutoReconnect(bool){}
}WiFi;
struct SerialSink {
 String output,input;
 explicit operator bool() const {return false;}
 size_t write(uint8_t c){output+=char(c);return 1;}
 size_t write(const uint8_t* p,size_t n){output.append(reinterpret_cast<const char*>(p),n);return n;}
 void print(const String&){}void println(const String&){}void println(){output+='\\n';}int available(){return input.size();}
 int read(){int c=input[0];input.erase(0,1);return c;}
}Serial;
String sanitizeHostname(const String& value){return value;}
void announceMdns(const String&){}
${association}
${body}
String request(const String& cmd,const String& id="request1"){
 return String(R"({"protocol":"lightweaver-usb-wifi","version":1,"id":")")+id+R"(","command":")"+cmd+
 R"(","expectedCardId":"lw-001122334455","expectedBootId":"boot-a","expectedFirmwareVersion":"1.2.3","expectedBuildId":"abcdef012345678901234567890123456789012345","expectedBuildNumber":100)";
}
JsonDocument send(String line){
 Serial.output.clear();usbWifiLine.clear();
 for(char c:line) assert(!usbWifiLine.push(c));
 assert(usbWifiLine.push('\\n'));handleUsbWifiRequest();usbWifiLine.clear();
 assert(Serial.output.find("test-secret")==String::npos);
 JsonDocument result; assert(!deserializeJson(result,Serial.output));return result;
}
int main(){
 auto hello=send(request("hello")+"}");assert(hello["ok"]==true);assert(hello["usbWifiProvisioning"]==true);
 auto altered=request("provision");altered.replace(altered.find("boot-a"),6,"boot-b");
 auto denied=send(altered+R"(,"ssid":"Gallery","password":"test-secret","clearPassword":false})");
 assert(denied["error"]=="identity_mismatch" && saves==0);
 for(const char* key:{"expectedCardId","expectedBootId","expectedFirmwareVersion","expectedBuildId","expectedBuildNumber"}){
  auto bad=request("status");auto at=bad.find(key);bad.replace(at,strlen(key),"missing");
  assert(send(bad+"}")["error"]=="identity_mismatch");
 }
 const String provision=R"(,"ssid":"Gallery","password":"test-secret","clearPassword":false})";
 knownGood=true;assert(send(request("provision")+provision)["error"]=="fresh_install_only");knownGood=false;
 safeMode=true;assert(send(request("provision")+provision)["error"]=="fresh_install_only");safeMode=false;
 cfg.wifi.proven=true;assert(send(request("provision")+provision)["error"]=="fresh_install_only");cfg.wifi.proven=false;
 cfg.pieceId="owner-project";assert(send(request("provision")+provision)["error"]=="fresh_install_only");cfg.pieceId="";
 assert(send(request("provision")+R"(,"ssid":"Gallery","password":"","clearPassword":false})")["error"]=="invalid_credentials");
 assert(send(request("provision")+R"(,"ssid":"Gallery\\u0000evil","password":"test-secret","clearPassword":false})")["error"]=="invalid_credentials");
 assert(saves==0);
 persistOk=false;assert(send(request("provision")+provision)["error"]=="persistence_failed");assert(starts==0);persistOk=true;
 cfg.wifiRuntime.stationIp="192.168.1.99";WiFi.mode=WIFI_STA;
 cfg.wifiRuntime.joinDiagnostics.begin(77);
 cfg.wifiRuntime.joinDiagnostics.disconnect(77,202);
 auto accepted=send(request("provision")+provision);
 assert(accepted["ok"]==true && accepted["accepted"]==true && accepted["attemptId"]=="request1");
 assert(accepted["wifi"]["failureStage"]==""); // old attempt cannot color new accepted credentials
 assert(accepted["wifi"]["stationIp"]=="" && accepted["wifi"]["transition"]=="joining");
 assert(pending && starts==0 && saves==2);
 // A lost provision reply or Studio reload can recover this exact attempt
 // through hello/status, including after association makes Wi-Fi proven.
 auto recoveredHello=send(request("hello","recovery-hello")+"}");
 assert(recoveredHello["attemptId"]=="request1" && recoveredHello["wifi"]["handoffGeneration"]==accepted["wifi"]["handoffGeneration"]);
 cfg.wifi.proven=true;
 cfg.wifiRuntime.connectivity.phase=lightweaver::ConnectivityPhase::Station;
 cfg.wifiRuntime.stationIp="192.168.1.99";
 auto recoveredStatus=send(request("status","recovery-status")+"}");
 assert(recoveredStatus["ok"]==true && recoveredStatus["freshInstallEligible"]==false);
 assert(recoveredStatus["attemptId"]=="request1" && recoveredStatus["wifi"]["stationIp"]=="192.168.1.99");
 assert(recoveredStatus["wifi"]["handoffGeneration"]==accepted["wifi"]["handoffGeneration"]);
 auto staleBootStatus=request("status","stale-boot");
 staleBootStatus.replace(staleBootStatus.find("boot-a"),6,"boot-b");
 assert(send(staleBootStatus+"}")["error"]=="identity_mismatch");
 cfg.wifi.proven=false;
 cfg.wifiRuntime.connectivity.phase=lightweaver::ConnectivityPhase::SetupAp;
 cfg.wifiRuntime.stationIp="";
 now=500;handleUsbWifi();assert(starts==0); // prior station event queue not fenced yet
 usbWifiStationStopped=true;handleUsbWifi();assert(starts==1 && usbWifiObserveDisconnects);
 auto duplicate=send(request("provision")+provision);assert(duplicate["ok"]==true && saves==2);
 usbWifiJoinFailed=true;usbWifiDisconnectReason=201;
 auto failed=send(request("status")+"}");assert(failed["wifi"]["failureReason"]=="ssid_not_found");
 usbWifiDisconnectReason=15;assert(send(request("status")+"}")["wifi"]["failureReason"]=="handshake_timeout");
 usbWifiDisconnectReason=202;assert(send(request("status")+"}")["wifi"]["failureReason"]=="authentication_failed");
 cfg.wifiRuntime.connectivity.phase=lightweaver::ConnectivityPhase::SetupAp;
 auto retry=send(request("provision","request2")+provision);assert(retry["attemptId"]=="request2");
 assert(retry["wifi"]["failureReason"]=="" && retry["wifi"]["driverReason"]==0 && saves==3);
 auto scan=send(request("scan")+"}");assert(scan["error"]=="busy");
 now=900;handleUsbWifi();cfg.wifiRuntime.connectivity.phase=lightweaver::ConnectivityPhase::SetupAp;
 scan=send(request("scan")+"}");assert(scan["networks"].size()==2);
 assert(scan["networks"][0]["ssid"]=="Other" && scan["networks"][1]["ssid"]=="Gallery");
 WiFi.mode=WIFI_STA;
 auto timeoutAttempt=send(request("provision","request3")+provision);
 assert(timeoutAttempt["wifi"]["failureStage"]=="");
 uint32_t generation=timeoutAttempt["wifi"]["handoffGeneration"];
 now=4000;handleUsbWifi();assert(usbWifiJoinFailed);
 auto timedOut=send(request("status")+"}");
 assert(timedOut["wifi"]["handoffGeneration"]==generation);
 assert(timedOut["attemptId"]=="request3" && timedOut["wifi"]["failureReason"]=="connection_failed");
 assert(timedOut["wifi"]["failureStage"]=="station"); // STA_STOP was not confirmed
 // An automatic retry may associate after the initial join timed out. The
 // accepted USB attempt must remain correlated, but its failure is no longer
 // true once the same station has an address.
 cfg.wifiRuntime.connectivity.generation=generation+1;
 applyStationAssociation(cfg,"192.168.1.98");
 assert(send(request("status")+"}")["wifi"]["joinFailed"]==true); // another generation is not this USB attempt
 cfg.wifiRuntime.connectivity.generation=generation;
 cfg.wifiRuntime.connectivity.phase=lightweaver::ConnectivityPhase::HandoffReady;
 applyStationAssociation(cfg,"192.168.1.99");
 auto recovered=send(request("status")+"}");
 assert(recovered["attemptId"]=="request3" && recovered["wifi"]["handoffGeneration"]==generation);
 assert(recovered["wifi"]["stationIp"]=="192.168.1.99" && recovered["wifi"]["joinFailed"]==false);
 assert(recovered["wifi"]["failureReason"]=="" && recovered["wifi"]["driverReason"]==0);
 Serial.input=String(400,'x');handleUsbWifi();assert(Serial.input.size()==144); // bounded work per tick
}
`);
 execFileSync('c++',['-std=c++17','-Wall','-Wextra','-Werror','-I'+json,join(dir,'test.cpp'),'-o',join(dir,'test')],{stdio:'inherit'});
 execFileSync(join(dir,'test'),{stdio:'inherit'});
}finally{rmSync(dir,{recursive:true,force:true});}
console.log('USB Wi-Fi production dispatcher, identity, attempt, secret, retry, and policy tests passed');
