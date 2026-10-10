# Upgrade from SPL v3.6 to v3.7 on Windows

Preserve your Google settings, owner account, products, customers and orders by copying the existing private files into the new project. Never upload those private files to GitHub or include them in a public ZIP.

1. In the PowerShell window running v3.6, press **Ctrl+C**. Stop any other SPL instance that uses the same data folder.
2. Extract the new ZIP. The project folder is the inner folder containing `package.json`.
3. Run this in PowerShell. These paths match Windows' usual nested extraction folders; adjust them if you extracted elsewhere. If your working version is v3.4 or v3.5, set `$oldShop` to that working folder instead:

```powershell
$oldShop = "C:\Users\HP ZBOOK STUDIO\Downloads\SPL-Connected-Shop-v3.6\SPL-Connected-Shop-v3.6"
$newShop = "C:\Users\HP ZBOOK STUDIO\Downloads\SPL-Connected-Shop-v3.7\SPL-Connected-Shop-v3.7"
if (!(Test-Path "$oldShop\package.json")) { throw "Correct oldShop to the working v3.6 folder containing package.json." }
if (!(Test-Path "$newShop\package.json")) { throw "Open the v3.7 folder that contains package.json and correct the newShop path." }

$backupFolder = Join-Path "$env:USERPROFILE\Downloads" ("SPL-private-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $backupFolder | Out-Null
if (Test-Path "$oldShop\data") {
    Copy-Item "$oldShop\data" $backupFolder -Recurse
    if (Test-Path "$newShop\data") {
        Copy-Item "$newShop\data" "$backupFolder\new-version-data" -Recurse
        Remove-Item "$newShop\data" -Recurse -Force
    }
    Copy-Item "$oldShop\data" "$newShop\data" -Recurse
}
Get-ChildItem $oldShop -Filter ".env*" -File -Force |
    Where-Object { $_.Name -ne ".env.example" } |
    ForEach-Object {
        Copy-Item $_.FullName $backupFolder
        $destination = Join-Path $newShop $_.Name
        if (Test-Path $destination) { Copy-Item $destination (Join-Path $backupFolder ("new-version-" + $_.Name)) }
        Copy-Item $_.FullName $destination -Force
    }
Set-Location $newShop
npm.cmd start
```

The stopped-server copy includes the SQLite database and its companion files, public product/QR uploads, and any private receipts. Keep the backup private. If you use a custom `DATA_DIRECTORY`, back up that actual folder instead and retain its setting; do not run two app instances against it.

If you started v3.7 before upgrading, this script also backs up its data and settings before replacing them with your working v3.6 files. Use v3.6 as the source only if it contains the data you want to keep; do not overwrite new real orders without merging them separately.

4. Open http://localhost:4174/owner/ and sign in with your existing Google owner account. **Do not run `owner:setup` again for an already configured owner.** Existing laptops keep their original image as a one-photo gallery. Saved photo order and cover are stored with the product. Your current receipts, payment methods, products, stock and owner identity remain in the same private data folder.
5. Check the new customer catalogue, header search and category/brand filters. In the owner dashboard, verify your products, photo galleries, orders and payment details. This update changes the interface; the same server, Google login and payment workflow remain in use.
6. Keep your backup private. Do not delete it until you have checked your products, bank details, owner login and orders in v3.7.

The Google callback remains `http://localhost:4174/api/auth/google/callback`, so you do not need another OAuth client just to upgrade. Existing settings are used; credentials are never included in the release.

To return to v3.6, stop v3.7 and restore the complete pre-upgrade backup into the old project. Do not use an older app to modify the upgraded database.
