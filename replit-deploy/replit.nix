{ pkgs }: {
  # Replit blocks apt/sudo. Keep the browser runtime in the Nix environment.
  # Chromium itself does not always expose GBM in the Shell profile, while
  # Patchright's downloaded headless Chromium requires libgbm.so.1 at launch.
  deps = [
    pkgs.chromium
    pkgs.mesa
    pkgs.libdrm
    pkgs.glib
    pkgs.gtk3
    pkgs.nss
    pkgs.alsa-lib
    pkgs.at-spi2-atk
    pkgs.pango
    pkgs.cairo
    pkgs.gdk-pixbuf
    pkgs.libxkbcommon
    pkgs.xorg.libX11
    pkgs.xorg.libxcb
    pkgs.xorg.libXcomposite
    pkgs.xorg.libXcursor
    pkgs.xorg.libXdamage
    pkgs.xorg.libXext
    pkgs.xorg.libXfixes
    pkgs.xorg.libXi
    pkgs.xorg.libXrandr
    pkgs.xorg.libXrender
    pkgs.xorg.libXtst
    pkgs.fontconfig
    pkgs.noto-fonts
    pkgs.noto-fonts-emoji
  ];
}
