#pragma once

// A blank password field is not an instruction to erase the saved secret.
// Open-network conversion is explicit; another SSID never inherits a secret.
constexpr bool preserveSavedWifiPassword(bool sameNetwork, bool savedPassword,
                                         bool submittedPassword, bool clearPassword) {
  return sameNetwork && savedPassword && !submittedPassword && !clearPassword;
}
