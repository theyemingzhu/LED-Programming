#pragma once
#include <cstddef>
#include <cstdint>

namespace lightweaver {
// One bounded line, discarded through its delimiter after overflow or NUL.
// clear() scrubs credentials even when the parser rejected the request.
template <std::size_t Capacity> class UsbWifiLineBuffer {
 public:
  bool push(char c) {
    if (c == '\n') {
      if (discarding_ || length_ == 0) { clear(); return false; }
      bytes_[length_] = 0;
      return true;
    }
    if (c == '\r') return false;
    if (discarding_) return false;
    if (c == 0 || length_ >= Capacity) {
      clear(); discarding_ = true; return false;
    }
    bytes_[length_++] = c;
    return false;
  }
  void clear() {
    volatile char* p = bytes_;
    for (std::size_t i=0;i<=Capacity;i++) p[i] = 0;
    length_ = 0; discarding_ = false;
  }
  const char* data() const { return bytes_; }
  std::size_t size() const { return length_; }
 private:
  char bytes_[Capacity+1] = {};
  std::size_t length_ = 0;
  bool discarding_ = false;
};
inline bool usbWifiRequestIdValid(const char* id) {
  if (!id || !*id) return false;
  std::size_t n=0;
  for (; id[n]; n++) {
    const char c=id[n];
    if (n>=64 || !((c>='a'&&c<='z') || (c>='A'&&c<='Z') ||
        (c>='0'&&c<='9') || c=='-' || c=='_')) return false;
  }
  return true;
}
// ESP-IDF disconnect reasons. AUTH_EXPIRE and handshake timeout do not prove
// that a password was wrong; keep them distinct from explicit AUTH_FAIL (202).
inline const char* usbWifiFailureReason(std::uint16_t reason) {
  switch(reason) {
    case 201: return "ssid_not_found";
    case 202: return "authentication_failed";
    case 15: case 204: return "handshake_timeout";
    default: return "connection_failed";
  }
}
}
