{ pkgs }: {
  # Replit blocks apt/sudo. Keep the browser runtime in the Nix environment.
  # Chromium itself does not always expose GBM in the Shell profile, while
  # Patchright's downloaded headless Chromium requires libgbm.so.1 at launch.
  deps = [
    pkgs.chromium
    pkgs.mesa
    pkgs.libdrm
    pkgs.fontconfig
    pkgs.noto-fonts
    pkgs.noto-fonts-emoji
  ];
}
