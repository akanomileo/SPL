# Upgrade from SPL v3.3 to v3.4 on Windows

Preserve your Google settings, owner account, products, customers and orders by copying the existing private files into the new project. Never upload those private files to GitHub or include them in a public ZIP.

1. In the PowerShell window running v3.3, press **Ctrl+C**. Stop any other SPL instance that uses the same data folder.
2. Extract the new ZIP. The project folder is the inner folder containing `package.json`.
3. Run this in PowerShell. These paths match Windows' usual nested extraction folders; adjust them if you extracted elsewhere:

```powershell
$oldShop = "C:\Users\HP ZBOOK STUDIO\Downloads\SPL-Connected-Shop-v3.3\SPL-Connected-Shop-v3.3"
$newShop = "C:\Users\HP ZBOOK STUDIO\Downloads\SPL-Connected-Shop-v3.4\SPL-Connected-Shop-v3.4"
if (!(Test-Path "$newShop\package.json")) { throw "Open the v3.4 folder that contains package.json and correct the newShop path." }

$backupFolder = Join-Path "$env:USERPROFILE\Downloads" ("SPL-private-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $backupFolder | Out-Null
if (Test-Path "$oldShop\data") {
    Copy-Item "$oldShop\data" $backupFolder -Recurse
    if (Test-Path "$newShop\data") { throw "The new project already has data. Back it up and check it before copying old data." }
    Copy-Item "$oldShop\data" "$newShop\data" -Recurse
}
Get-ChildItem $oldShop -Filter ".env*" -File -Force |
    Where-Object { $_.Name -ne ".env.example" } |
    ForEach-Object {
        Copy-Item $_.FullName $backupFolder
        $destination = Join-Path $newShop $_.Name
        if (Test-Path $destination) { throw "A settings file already exists at $destination. Compare it before replacing it." }
        Copy-Item $_.FullName $destination
    }
Set-Location $newShop
npm.cmd start
```

The stopped-server copy includes the SQLite database and its companion files, public product/QR uploads, and any private receipts. Keep the backup private. If you use a custom `DATA_DIRECTORY`, back up that actual folder instead and retain its setting; do not run two app instances against it.

4. Open http://localhost:4174/owner/ and sign in with your existing Google owner account. **Do not run `owner:setup` again for an already configured owner.** The database adds the new payment tables and product fields when it starts. Existing orders remain readable and use the previous payment workflow; new orders require a configured payment method and receipt confirmation.
5. Add your actual details in **Payment methods**. There are no supplied bank details or real QR codes in the package.
6. Review collection and brand labels. Existing products without a collection become Good Second; known brands are inferred from names, and unidentified brands use Other. Edit them as needed.

The Google callback remains `http://localhost:4174/api/auth/google/callback`, so you do not need another OAuth client just to upgrade. Existing settings are used; credentials are never included in the release.

To return to v3.3, stop v3.4 and restore the complete pre-upgrade backup into the old project. Do not use an older app to modify the upgraded database.
