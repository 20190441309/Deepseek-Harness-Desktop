# Deepseek-Harness-Desktop NSIS customization (assisted installer only).
#
# Scope is GUI polish exclusively: every macro below is skipped in silent
# mode (/S), so QA TC-INST silent installs, overwrite upgrades and the
# SHA512SUMS updater flow are untouched. No sections, no exec-level changes,
# no MessageBox.

# Inserted where assistedInstaller.nsh declares pages, i.e. before the
# license/directory/instfiles/finish pages — the only place where MUI page
# defines for the finish page can still take effect.
!macro customWelcomePage
  # electron-builder's assisted installer ships without a welcome page by
  # default; add the standard MUI one so the branded sidebar bitmap and the
  # localized (zh_CN/en_US) welcome copy are shown.
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_FINISHPAGE_TITLE_3LINES
  # Language-neutral link on the finish page (product home / releases).
  !define MUI_FINISHPAGE_LINK "github.com/ChisaAlter/Deepseek-Harness-Desktop"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/ChisaAlter/Deepseek-Harness-Desktop"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customHeader
  # Replace the stock "Nullsoft Install System vX.XX" footer with the product.
  BrandingText "Deepseek-Harness-Desktop ${VERSION}"
!macroend
