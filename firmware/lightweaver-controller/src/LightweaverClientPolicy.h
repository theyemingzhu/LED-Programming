#pragma once
#include <cstring>
inline bool clientHttpRouteAllowed(const char* method, const char* uri) {
  if (!strcmp(method, "OPTIONS")) return clientHttpRouteAllowed("GET", uri) || clientHttpRouteAllowed("POST", uri);
  if (!strcmp(method, "POST")) return !strcmp(uri, "/api/control") || !strcmp(uri, "/api/client-playlist") || !strcmp(uri, "/api/client-pattern");
  return !strcmp(method, "GET") && (!strcmp(uri, "/api/status") || !strcmp(uri, "/api/patterns") ||
      !strcmp(uri, "/api/zones") || !strcmp(uri, "/api/firmware-info") || !strcmp(uri, "/api/client-playlist") || !strcmp(uri, "/api/client-pattern"));
}
