param(
  [string]$MainSheet = "assets/source/trophies-main.png",
  [string]$WoodSheet = "assets/source/trophies-wood.png",
  [string]$OutDir = "public/branding/trophies",
  [int]$Padding = 16,
  [int]$BackgroundTolerance = 30
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

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
  $slotWidth = $x1 - $x0

  if ($x0 -lt 0 -or $x1 -gt $Sheet.Width -or $slotWidth -le 0) {
    throw "Slot index $SlotIndex is outside of sheet width $($Sheet.Width)."
  }

  return [System.Drawing.Rectangle]::new($x0, 0, $slotWidth, $Sheet.Height)
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

  $sampleBottom = [Math]::Max(1, [Math]::Floor($Sheet.Height * 0.25))
  $hist = @{}

  for ($y = 0; $y -lt $sampleBottom; $y += 2) {
    for ($x = 0; $x -lt $Sheet.Width; $x += 2) {
      $pixel = $Sheet.GetPixel($x, $y)
      if ($pixel.A -lt 240) {
        continue
      }
      $key = "$($pixel.R),$($pixel.G),$($pixel.B)"
      if ($hist.ContainsKey($key)) {
        $hist[$key] += 1
      }
      else {
        $hist[$key] = 1
      }
    }
  }

  $top = $hist.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 2
  if ($top.Count -lt 2) {
    # Fallback for unexpected sheets.
    return @(
      [System.Drawing.Color]::FromArgb(255, 204, 204, 204),
      [System.Drawing.Color]::FromArgb(255, 179, 179, 179)
    )
  }

  $colors = @()
  foreach ($entry in $top) {
    $parts = $entry.Key.Split(",")
    $colors += [System.Drawing.Color]::FromArgb(255, [int]$parts[0], [int]$parts[1], [int]$parts[2])
  }

  return $colors
}

function Get-LargestForegroundBounds {
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

  $width = $SlotRect.Width
  $height = $SlotRect.Height
  $size = $width * $height
  $mask = New-Object bool[] $size
  $visited = New-Object bool[] $size

  for ($y = 0; $y -lt $height; $y += 1) {
    for ($x = 0; $x -lt $width; $x += 1) {
      $pixel = $Sheet.GetPixel($SlotRect.X + $x, $SlotRect.Y + $y)
      if ($pixel.A -lt 16) {
        continue
      }

      $dA = Get-DistanceSq -A $pixel -B $BackgroundA
      $dB = Get-DistanceSq -A $pixel -B $BackgroundB
      $index = ($y * $width) + $x
      $mask[$index] = ([Math]::Min($dA, $dB) -gt $ToleranceSq)
    }
  }

  $largestArea = 0
  $best = $null

  for ($y = 0; $y -lt $height; $y += 1) {
    for ($x = 0; $x -lt $width; $x += 1) {
      $startIndex = ($y * $width) + $x
      if (-not $mask[$startIndex] -or $visited[$startIndex]) {
        continue
      }

      $queue = [System.Collections.Generic.Queue[int]]::new()
      $queue.Enqueue($startIndex)
      $visited[$startIndex] = $true

      $area = 0
      $minX = $x
      $maxX = $x
      $minY = $y
      $maxY = $y

      while ($queue.Count -gt 0) {
        $index = $queue.Dequeue()
        $cx = $index % $width
        $cy = [Math]::Floor($index / $width)

        $area += 1
        if ($cx -lt $minX) { $minX = $cx }
        if ($cx -gt $maxX) { $maxX = $cx }
        if ($cy -lt $minY) { $minY = $cy }
        if ($cy -gt $maxY) { $maxY = $cy }

        $neighbors = @(
          @($cx - 1, $cy),
          @($cx + 1, $cy),
          @($cx, $cy - 1),
          @($cx, $cy + 1)
        )

        foreach ($neighbor in $neighbors) {
          $nx = $neighbor[0]
          $ny = $neighbor[1]
          if ($nx -lt 0 -or $nx -ge $width -or $ny -lt 0 -or $ny -ge $height) {
            continue
          }

          $nIndex = ($ny * $width) + $nx
          if ($visited[$nIndex] -or -not $mask[$nIndex]) {
            continue
          }

          $visited[$nIndex] = $true
          $queue.Enqueue($nIndex)
        }
      }

      if ($area -gt $largestArea) {
        $largestArea = $area
        $best = [System.Drawing.Rectangle]::new(
          $SlotRect.X + $minX,
          $SlotRect.Y + $minY,
          ($maxX - $minX + 1),
          ($maxY - $minY + 1)
        )
      }
    }
  }

  if ($best -eq $null) {
    return $SlotRect
  }

  return $best
}

function Export-CenteredCrop {
  param(
    [Parameter(Mandatory = $true)]
    [System.Drawing.Bitmap]$Sheet,
    [Parameter(Mandatory = $true)]
    [System.Drawing.Rectangle]$SourceBounds,
    [Parameter(Mandatory = $true)]
    [int]$CanvasWidth,
    [Parameter(Mandatory = $true)]
    [int]$CanvasHeight,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
  )

  $canvas = [System.Drawing.Bitmap]::new($CanvasWidth, $CanvasHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $destX = [Math]::Floor(($CanvasWidth - $SourceBounds.Width) / 2)
    $destY = [Math]::Floor(($CanvasHeight - $SourceBounds.Height) / 2)
    $destRect = [System.Drawing.Rectangle]::new($destX, $destY, $SourceBounds.Width, $SourceBounds.Height)
    $graphics.DrawImage($Sheet, $destRect, $SourceBounds, [System.Drawing.GraphicsUnit]::Pixel)
    $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $graphics.Dispose()
    $canvas.Dispose()
  }
}

if (-not (Test-Path -Path $MainSheet -PathType Leaf)) {
  throw "Missing main trophy sheet: $MainSheet"
}

if (-not (Test-Path -Path $WoodSheet -PathType Leaf)) {
  throw "Missing wood trophy sheet: $WoodSheet"
}

New-Item -Path $OutDir -ItemType Directory -Force | Out-Null

$mainBitmap = [System.Drawing.Bitmap]::new($MainSheet)
$woodBitmap = [System.Drawing.Bitmap]::new($WoodSheet)

try {
  $mainPalette = Get-BackgroundPalette -Sheet $mainBitmap
  $woodPalette = Get-BackgroundPalette -Sheet $woodBitmap
  $toleranceSq = $BackgroundTolerance * $BackgroundTolerance

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
    $slotRect = Get-SlotRect -Sheet $item.sheet -SlotCount 5 -SlotIndex $item.slot
    $bounds = Get-LargestForegroundBounds `
      -Sheet $item.sheet `
      -SlotRect $slotRect `
      -BackgroundA $item.palette[0] `
      -BackgroundB $item.palette[1] `
      -ToleranceSq $toleranceSq

    $boundsByFile[$item.file] = @{
      sheet = $item.sheet
      bounds = $bounds
    }

    if ($bounds.Width -gt $maxWidth) { $maxWidth = $bounds.Width }
    if ($bounds.Height -gt $maxHeight) { $maxHeight = $bounds.Height }
  }

  $canvasWidth = $maxWidth + ($Padding * 2)
  $canvasHeight = $maxHeight + ($Padding * 2)

  foreach ($item in $exports) {
    $entry = $boundsByFile[$item.file]
    Export-CenteredCrop `
      -Sheet $entry.sheet `
      -SourceBounds $entry.bounds `
      -CanvasWidth $canvasWidth `
      -CanvasHeight $canvasHeight `
      -OutputPath (Join-Path $OutDir $item.file)
  }
}
finally {
  $mainBitmap.Dispose()
  $woodBitmap.Dispose()
}

Write-Host "Trophy PNGs exported to $OutDir (centered $canvasWidth x $canvasHeight)."
