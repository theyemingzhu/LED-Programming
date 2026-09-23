#include <cassert>
#include <cstring>
#include "../src/LightweaverUsbWifiPolicy.h"
int main() {
 using namespace lightweaver;
 UsbWifiLineBuffer<12> line;
 assert(!line.push('{')); assert(!line.push('}')); assert(line.push('\n'));
 assert(std::strcmp(line.data(), "{}") == 0); line.clear();
 for (int i=0;i<15;i++) assert(!line.push('x'));
 assert(!line.push('\n')); assert(line.size()==0);
 assert(!line.push('x')); assert(!line.push('\0')); assert(!line.push('\n'));
 assert(line.size()==0); assert(!line.push('y')); assert(line.push('\n')); line.clear();
 assert(usbWifiRequestIdValid("abc-19_X"));
 assert(!usbWifiRequestIdValid("password with spaces"));
 assert(!usbWifiRequestIdValid(""));
 assert(std::strcmp(usbWifiFailureReason(201), "ssid_not_found")==0);
 assert(std::strcmp(usbWifiFailureReason(202), "authentication_failed")==0);
 assert(std::strcmp(usbWifiFailureReason(15), "handshake_timeout")==0);
 assert(std::strcmp(usbWifiFailureReason(204), "handshake_timeout")==0);
 assert(std::strcmp(usbWifiFailureReason(2), "connection_failed")==0);
 assert(std::strcmp(usbWifiFailureReason(0), "connection_failed")==0);
}
