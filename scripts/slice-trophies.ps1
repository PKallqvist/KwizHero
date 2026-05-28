param(
  [string]$MainSheet = "",
  [string]$WoodSheet = "",
  [string]$OutDir = "public/branding/trophies",
  [int]$Padding = 16,
  [int]$BackgroundTolerance = 34
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function Resolve-SourceImage {
  param(
    [AllowEmptyString()]
    [string]$RequestedPath,
    [Parameter(Mandatory = $true)]
    [string[]]$FallbackCandidates,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if (-not [string]::IsNullOrWhiteSpace($RequestedPath) -and (Test-Path -Path $RequestedPath -PathType Leaf)) {
    return $RequestedPath
  }

  foreach ($candidate in $FallbackCandidates) {
    if (Test-Path -Path $candidate -PathType Leaf) {
      return $candidate
    }
  }

  throw "Missing $Label trophy sheet. Checked: $($FallbackCandidates -join ', ')"
}

function Get-SlotRect {
  param(
    [Parameter(Mandatory = $true)]
    [System.Drawing.Bitmap]$Sheet,
    [Parameter(Mandatory = $true)]
    [int]$SlotIndex,
    [Parameter(Mandatory = $true)]
    [int]$SlotCount
  )

  $x0 = [Math]::Floor($Sheet.Width * $SlotIndex / $SlotCount)
  $x1 = [Math]::Floor($Sheet.Width * ($SlotIndex + 1) / $SlotCount)
  return [System.Drawing.Rectangle]::new($x0, 0, ($x1 - $x0), $Sheet.Height)
}

function Get-DistanceSq {
  param(
    [Parameter(Mandatory = $true)]
    [System.Drawing.Color]$A,
    [Parameter(Mandatory = $true)]
    [System.Drawing.Color]$B
  )

  $dr = [int]$A.R - [int]$B.R
  $dg = [int]$A.G - [int]$B.G
  $db = [int]$A.B - [int]$B.B
  return ($dr * $dr) + ($dg * $dg) + ($db * $db)
}

function Get-BackgroundPalette {
  param(
    [Parameter(Mandatory = $true)]
    [System.Drawing.Bitmap]$Sheet
  )

  $sampleHeight = [Math]::Max(1, [Math]::Floor($Sheet.Height * 0.30))
  $hist = @{}

  for ($y = 0; $y -lt $sampleHeight; $y += 2) {
    for ($x = 0; $x -lt $Sheet.Width; $x += 2) {
      $p = $Sheet.GetPixel($x, $y)
      if ($p.A -lt 240) { continue }
      $key = "$($p.R),$($p.G),$($p.B)"
      if ($hist.ContainsKey($key)) { $hist[$key] += 1 } else { $hist[$key] = 1 }
    }
  }

  $top = $hist.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 2
  if ($top.Count -lt 2) {
    return @(
      [System.Drawing.Color]::FromArgb(255, 204, 204, 204),
      [System.Drawing.Color]::FromArgb(255, 179, 179, 179)
    )
  }

  $colors = @()
  foreach ($entry in $top) {
    $parts = $entry.Key.Split(',')
    $colors += [System.Drawing.Color]::FromArgb(255, [int]$parts[0], [int]$parts[1], [int]$parts[2])
  }
  return $colors
}

function Get-ForegroundBounds {
  param(
    [Parameter(Mandatory = $true)]
    [System.Drawing.Bitmap]$Sheet,
    [Parameter(Mandatory = $true)]
    [System.Drawing.Rectangle]$SlotRect,
    [Parameter(Mandatory = $true)]
    [System.Drawing.Color]$BackgroundA,
    [Parameter(Mandatory = $true)]
    [System.Drawing.Color]$BackgroundB,
    [Parameter(Mandatory = $true)]
    [int]$ToleranceSq
  )

  $minX = [int]::MaxValue
  $minY = [int]::MaxValue
  $maxX = -1
  $maxY = -1

  $scanTop = [int][Math]::Floor($SlotRect.Height * 0.18)
  $scanBottom = [int][Math]::Floor($SlotRect.Height * 0.92)

  for ($y = $scanTop; $y -lt $scanBottom; $y += 1) {
    for ($x = 0; $x -lt $SlotRect.Width; $x += 1) {
      $px = $SlotRect.X + $x
      $py = $SlotRect.Y + $y
      $p = $Sheet.GetPixel($px, $py)
      if ($p.A -lt 16) { continue }

      $dA = Get-DistanceSq -A $p -B $BackgroundA
      $dB = Get-DistanceSq -A $p -B $BackgroundB
      if ([Math]::Min($dA, $dB) -le $ToleranceSq) { continue }

      if ($px -lt $minX) { $minX = $px }
      if ($px -gt $maxX) { $maxX = $px }
      if ($py -lt $minY) { $minY = $py }
      if ($py -gt $maxY) { $maxY = $py }
    }
  }

  if ($maxX -lt $minX -or $maxY -lt $minY) {
    return $SlotRect
  }

  return [System.Drawing.Rectangle]::new($minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1))
}

function Export-Centered {
  param(
    [Parameter(Mandatory = $true)]
    [System.Drawing.Bitmap]$Sheet,
    [Parameter(Mandatory = $true)]
    [System.Drawing.Rectangle]$Source,
    [Parameter(Mandatory = $true)]
    [int]$CanvasWidth,
    [Parameter(Mandatory = $true)]
    [int]$CanvasHeight,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
  )

  $canvas = [System.Drawing.Bitmap]::new($CanvasWidth, $CanvasHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  try {
    $g.Clear([System.Drawing.Color]::Transparent)
    $destX = [int][Math]::Floor(($CanvasWidth - $Source.Width) / 2)
    $destY = [int][Math]::Floor(($CanvasHeight - $Source.Height) / 2)
    $dest = [System.Drawing.Rectangle]::new($destX, $destY, $Source.Width, $Source.Height)
    $g.DrawImage($Sheet, $dest, $Source, [System.Drawing.GraphicsUnit]::Pixel)
    $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $g.Dispose()
    $canvas.Dispose()
  }
}

$MainSheet = Resolve-SourceImage -RequestedPath $MainSheet -FallbackCandidates @(
  "assets/source/trophies-main.png",
  "public/assets/source/trophies-main.png"
) -Label "main"

$WoodSheet = Resolve-SourceImage -RequestedPath $WoodSheet -FallbackCandidates @(
  "assets/source/trophies-wood.png",
  "public/assets/source/trophies-wood.png"
) -Label "wood"

New-Item -Path $OutDir -ItemType Directory -Force | Out-Null

$mainBitmap = [System.Drawing.Bitmap]::new($MainSheet)
$woodBitmap = [System.Drawing.Bitmap]::new($WoodSheet)

try {
  $mainPalette = Get-BackgroundPalette -Sheet $mainBitmap
  $woodPalette = Get-BackgroundPalette -Sheet $woodBitmap
  $tolSq = $BackgroundTolerance * $BackgroundTolerance

  $exports = @(
    @{ sheet = $mainBitmap; slot = 0; palette = $mainPalette; file = "trophy-iron.png" },
    @{ sheet = $mainBitmap; slot = 1; palette = $mainPalette; file = "trophy-bronze.png" },
    @{ sheet = $mainBitmap; slot = 2; palette = $mainPalette; file = "trophy-silver.png" },
    @{ sheet = $mainBitmap; slot = 3; palette = $mainPalette; file = "trophy-gold.png" },
    @{ sheet = $mainBitmap; slot = 4; palette = $mainPalette; file = "trophy-platinum.png" },
    @{ sheet = $woodBitmap; slot = 4; palette = $woodPalette; file = "trophy-wood.png" }
  )

  $boundsByFile = @{}
  $maxWidth = 0
  $maxHeight = 0

  foreach ($item in $exports) {
    $slotRect = Get-SlotRect -Sheet $item.sheet -SlotIndex $item.slot -SlotCount 5
    $bounds = Get-ForegroundBounds -Sheet $item.sheet -SlotRect $slotRect -BackgroundA $item.palette[0] -BackgroundB $item.palette[1] -ToleranceSq $tolSq
    $boundsByFile[$item.file] = @{ sheet = $item.sheet; bounds = $bounds }

    if ($bounds.Width -gt $maxWidth) { $maxWidth = $bounds.Width }
    if ($bounds.Height -gt $maxHeight) { $maxHeight = $bounds.Height }
  }

  $canvasWidth = $maxWidth + ($Padding * 2)
  $canvasHeight = $maxHeight + ($Padding * 2)

  foreach ($item in $exports) {
    $entry = $boundsByFile[$item.file]
    Export-Centered -Sheet $entry.sheet -Source $entry.bounds -CanvasWidth $canvasWidth -CanvasHeight $canvasHeight -OutputPath (Join-Path $OutDir $item.file)
  }

  Write-Host "Trophy PNGs exported to $OutDir (centered $canvasWidth x $canvasHeight)."
}
finally {
  $mainBitmap.Dispose()
  $woodBitmap.Dispose()
}
