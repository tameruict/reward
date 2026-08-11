{ pkgs }: {
  # Replit blocks apt/sudo. Chromium brings the shared GTK/NSS/X11 runtime
  # libraries that Patchright's downloaded headless browser needs.
  deps = [
    pkgs.chromium
    pkgs.fontconfig
    pkgs.noto-fonts
    pkgs.noto-fonts-emoji
  ];
}
