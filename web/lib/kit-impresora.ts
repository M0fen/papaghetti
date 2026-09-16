/**
 * EL KIT DEL PC DE LA CAJA: un solo archivo que deja Windows listo para la térmica.
 *
 * La TP586 del local es SOLO USB. Por USB, Windows la toma con su controlador de
 * impresoras (usbprint) y no la ofrece como puerto COM: el camino "imprimir directo"
 * del navegador no la alcanza. El único camino es el de siempre —driver instalado,
 * Chrome manda a esa impresora— y ahí es donde han fallado todas las pruebas: nunca
 * en la web, siempre en la instalación. Y quien la prueba está solo delante del PC.
 *
 * Así que en vez de otra página de instrucciones, un .bat de doble clic que hace lo
 * que haría un técnico sentado ahí, EN ORDEN y preguntando antes de tocar nada:
 *
 *  1. Servicio de impresión encendido.
 *  2. ¿Está la impresora conectada por USB? ¿Algún aparato USB da error (cable)?
 *  3. ¿Hay una térmica instalada en Windows? Si no, abre las páginas del driver.
 *     Si el driver es "Generic / Text Only", avisa de que no sirve para la imagen.
 *  4. Puerto USB00x correcto, sin "pausada" ni "sin conexión", sin trabajos atascados.
 *  5. Predeterminada (y que Windows no la cambie sola).
 *  6. Abre las preferencias para elegir el papel de 58 mm.
 *  7. Página de prueba de Windows, y una PRUEBA DIRECTA en ESC/POS por la cola en
 *     modo RAW: si la de Windows no sale y la directa sí, el problema es el driver;
 *     si ninguna sale, es cable, puerto, papel o la impresora.
 *  8. Acceso directo "Papaghetti Caja" con --kiosk-printing (imprime sin diálogo).
 *  9. Un informe en el Escritorio y en el portapapeles, para mandarlo por WhatsApp.
 *
 * FORMATO. Un .bat que lleva el PowerShell dentro: el cmd corre las primeras líneas
 * (pide administrador y lanza PowerShell sobre el mismo archivo) y PowerShell ejecuta
 * lo que va después de la marca. Así es UN archivo y basta doble clic, sin tocar la
 * política de ejecución del equipo. Sin BOM (el cmd lo leería como basura en la
 * primera línea) y con finales CRLF.
 *
 * El PowerShell va en un template de TypeScript: no puede llevar comillas invertidas
 * (el escape de PowerShell) ni la secuencia dólar-llave. La prueba lo comprueba.
 * Es PowerShell 5.1 (el que trae Windows 10/11).
 */

export const MARCA_PS = "##PG-POWERSHELL##";

function lanzador(): string {
  return `@echo off
chcp 65001 >nul
title Papaghetti - preparar la impresora
if defined PG_SOLO_DIAGNOSTICO goto correr
net session >nul 2>&1
if errorlevel 1 (
  echo Pidiendo permiso de administrador para revisar la impresora...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
:correr
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = Get-Content -Raw -Encoding UTF8 -LiteralPath '%~f0'; $i = $t.IndexOf('#'+'#PG-POWERSHELL#'+'#'); Invoke-Expression $t.Substring($i)"
if not defined PG_SOLO_DIAGNOSTICO pause
exit /b
`;
}

function powershell(sitio: string): string {
  const s = sitio.replace(/'/g, "''");
  return `${MARCA_PS}
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$Sitio = '${s}'
$SoloDiagnostico = [bool]$env:PG_SOLO_DIAGNOSTICO
$informe = New-Object System.Collections.Generic.List[string]
$problemas = New-Object System.Collections.Generic.List[string]

function Linea([string]$t, [string]$color) { if (-not $color) { $color = 'Gray' }; Write-Host $t -ForegroundColor $color; $informe.Add($t) }
function Titulo([string]$t) { Linea ''; Linea ('== ' + $t + ' ==') 'Cyan' }
function Bien([string]$t) { Linea ('  [OK] ' + $t) 'Green' }
function Ojo([string]$t) { Linea ('  [!!] ' + $t) 'Yellow' }
function Mal([string]$t) { Linea ('  [XX] ' + $t) 'Red'; $problemas.Add($t) }
function Info([string]$t) { Linea ('       ' + $t) 'Gray' }
function Pregunta([string]$t) {
  if ($SoloDiagnostico) { $informe.Add('  ? ' + $t + ' -> (solo diagnostico)'); return $false }
  $r = Read-Host ('  ' + $t + ' (S/N)')
  $si = $r -match '^\\s*[sSyY]'
  if ($si) { $informe.Add('  ? ' + $t + ' -> S') } else { $informe.Add('  ? ' + $t + ' -> N') }
  return $si
}

Linea 'PAPAGHETTI - preparar la impresora termica (Star POS TP586, 58 mm, USB)' 'White'
Linea ('Fecha: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')) 'Gray'
try {
  $so = Get-CimInstance Win32_OperatingSystem
  Linea ('Equipo: ' + $env:COMPUTERNAME + ' - ' + $so.Caption + ' ' + $so.Version) 'Gray'
} catch {}
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Linea ('Usuario: ' + $env:USERNAME + $(if ($esAdmin) { ' (administrador)' } else { ' (SIN permisos de administrador: algunos arreglos no se podran hacer)' })) 'Gray'

# ---------- 1. Servicio de impresion ----------
Titulo '1. Servicio de impresion de Windows'
$sp = Get-Service -Name Spooler -ErrorAction SilentlyContinue
if (-not $sp) {
  Mal 'No existe el servicio "Cola de impresion" en este Windows.'
} elseif ($sp.Status -ne 'Running') {
  Mal ('El servicio "Cola de impresion" esta ' + $sp.Status + '. Sin el, nada imprime.')
  if (Pregunta 'Encenderlo ahora?') {
    try { Set-Service -Name Spooler -StartupType Automatic; Start-Service -Name Spooler; Bien 'Servicio encendido.' } catch { Mal ('No se pudo encender: ' + $_.Exception.Message) }
  }
} else {
  Bien 'El servicio "Cola de impresion" esta encendido.'
}

# ---------- 2. La impresora por USB ----------
Titulo '2. La impresora conectada por USB'
$pnp = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue)
# OJO: -match no distingue mayusculas y "POS" cae dentro de "dispositivo": POS va con -cmatch.
$usbImpresora = @($pnp | Where-Object { ($_.Status -eq 'OK') -and (($_.InstanceId -like 'USBPRINT\\*') -or (($_.InstanceId -like 'USB\\*') -and (($_.FriendlyName -match 'impresora|printer|printing') -or ($_.FriendlyName -cmatch '\\bPOS')))) })
if ($usbImpresora.Count -gt 0) {
  foreach ($d in $usbImpresora) { Bien ('Windows ve: ' + $d.FriendlyName + ' (' + $d.InstanceId + ')') }
} else {
  Ojo 'Windows no muestra ninguna impresora USB conectada ahora mismo.'
  Info 'Revisa: impresora ENCENDIDA (luz), cable USB bien puesto en los dos lados.'
}
$usbError = @($pnp | Where-Object { ($_.InstanceId -like 'USB\\*') -and ($_.Status -eq 'Error') })
foreach ($d in $usbError) {
  Mal ('Un aparato USB conectado da ERROR: ' + $d.FriendlyName + ' (' + $d.InstanceId + ')')
  Info 'Si es la impresora: cambia el cable USB o conectala a un puerto de ATRAS del PC, sin hub ni alargue.'
}

# ---------- 3. La termica instalada en Windows ----------
Titulo '3. Impresoras instaladas en Windows'
$impresoras = @(Get-Printer -ErrorAction SilentlyContinue)
foreach ($p in $impresoras) { Info ('- ' + $p.Name + ' | driver: ' + $p.DriverName + ' | puerto: ' + $p.PortName + ' | estado: ' + $p.PrinterStatus) }
$termicas = @($impresoras | Where-Object { (($_.Name + ' ' + $_.DriverName) -match '58|XP-|Xprinter|Thermal|Termica|Receipt|TP586|Star|ZJ-|Gprinter|GP-|Generic / Text') -or (($_.Name + ' ' + $_.DriverName) -cmatch 'POS') -and ($_.DriverName -notmatch 'PDF|OneNote|XPS|Fax') })
$t = $null
# Para probar el kit en un PC sin termica: PG_FORZAR_TERMICA = nombre de otra impresora.
if ($env:PG_FORZAR_TERMICA) { $termicas = @($impresoras | Where-Object { $_.Name -eq $env:PG_FORZAR_TERMICA }) }
if ($termicas.Count -eq 0) {
  Mal 'Windows NO tiene instalada la termica. Chrome solo puede imprimir en impresoras instaladas: por eso solo ofrece "Guardar como PDF".'
  Info 'Instala el driver de 58 mm (en este orden):'
  Info '  a) El CD o el archivo que dio el vendedor.'
  Info '  b) POS-STAR: https://pos-star.com/drivers-impresoras-termicas-2/ (el de 58MM)'
  Info '  c) Xprinter: https://www.xprintertech.com/drivers-2.html ("Bill product driver")'
  Info 'Al instalar: modelo POS-58 (o XP-58), conexion USB, puerto USB001. Luego vuelve a abrir este kit.'
  if (Pregunta 'Abrir ahora las paginas de los drivers en el navegador?') {
    Start-Process 'https://pos-star.com/drivers-impresoras-termicas-2/'
    Start-Process 'https://www.xprintertech.com/drivers-2.html'
  }
} elseif ($termicas.Count -eq 1) {
  $t = $termicas[0]
  Bien ('Termica encontrada: ' + $t.Name)
} else {
  Ojo 'Hay varias impresoras que parecen termicas:'
  for ($k = 0; $k -lt $termicas.Count; $k++) { Info ('  ' + ($k + 1) + ') ' + $termicas[$k].Name + ' (' + $termicas[$k].PortName + ')') }
  $t = $termicas[0]
  if (-not $SoloDiagnostico) {
    $n = Read-Host '  Numero de la que esta conectada (Enter = 1)'
    if ($n -match '^\\d+$' -and [int]$n -ge 1 -and [int]$n -le $termicas.Count) { $t = $termicas[[int]$n - 1] }
  }
  Info ('Se revisa: ' + $t.Name)
}

if ($t) {
  if ($t.DriverName -match 'Generic / Text') {
    Mal ('El driver de "' + $t.Name + '" es "Generic / Text Only": solo saca texto plano y el comprobante es una IMAGEN. Instala el driver POS-58 (paso 3 de arriba).')
  }

  # ---------- 4. Puerto, pausa, sin conexion, atascos ----------
  Titulo '4. Estado de la cola de la termica'
  $puertosUsb = @(Get-PrinterPort -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'USB*' })
  if ($t.PortName -like 'USB*') {
    Bien ('Puerto: ' + $t.PortName)
    if ($puertosUsb.Count -gt 1) { Info ('Hay ' + $puertosUsb.Count + ' puertos USB (' + (($puertosUsb | ForEach-Object { $_.Name }) -join ', ') + '). Si la prueba no sale, prueba con otro.') }
  } else {
    Ojo ('La termica esta en el puerto "' + $t.PortName + '", no en uno USB.')
    if ($puertosUsb.Count -ge 1) {
      $destino = $puertosUsb[0].Name
      if (Pregunta ('Pasarla al puerto ' + $destino + '?')) {
        try { Set-Printer -Name $t.Name -PortName $destino; Bien ('Ahora usa ' + $destino) } catch { Mal ('No se pudo cambiar el puerto: ' + $_.Exception.Message) }
      }
    } else {
      Mal 'No existe ningun puerto USB00x: Windows no ha detectado la impresora por USB (revisa cable y encendido, y reinstala el driver con la impresora conectada).'
    }
  }
  $w = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $t.Name }
  if ($w -and $w.WorkOffline) {
    Mal 'La cola esta marcada "Usar impresora sin conexion".'
    if (Pregunta 'Quitar esa marca?') { try { Set-CimInstance -InputObject $w -Property @{ WorkOffline = $false }; Bien 'Marca quitada.' } catch { Mal ('No se pudo: ' + $_.Exception.Message) } }
  } else { Bien 'No esta "sin conexion".' }
  if ($t.PrinterStatus -match 'Paused|Pausa') {
    Mal 'La cola esta en PAUSA.'
    if ($w -and (Pregunta 'Reanudarla?')) { try { Invoke-CimMethod -InputObject $w -MethodName Resume | Out-Null; Bien 'Reanudada.' } catch { Mal ('No se pudo: ' + $_.Exception.Message) } }
  } else { Bien ('Estado de la cola: ' + $t.PrinterStatus) }
  $trabajos = @(Get-PrintJob -PrinterName $t.Name -ErrorAction SilentlyContinue)
  if ($trabajos.Count -gt 0) {
    Ojo ('Hay ' + $trabajos.Count + ' trabajo(s) atascados en la cola (ahi estaban los tiquetes que nunca salieron).')
    if (Pregunta 'Borrarlos?') { $trabajos | Remove-PrintJob -ErrorAction SilentlyContinue; Bien 'Cola vaciada.' }
  } else { Bien 'Sin trabajos atascados.' }

  # ---------- 5. Predeterminada ----------
  Titulo '5. Impresora predeterminada'
  $clave = 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows'
  $legacy = (Get-ItemProperty -Path $clave -Name LegacyDefaultPrinterMode -ErrorAction SilentlyContinue).LegacyDefaultPrinterMode
  if ($w -and $w.Default -and $legacy -eq 1) {
    Bien 'Es la predeterminada y Windows no la cambia solo.'
  } else {
    if (-not ($w -and $w.Default)) { Ojo 'No es la impresora predeterminada.' }
    if ($legacy -ne 1) { Ojo 'Windows esta administrando la predeterminada (la cambia segun la ultima usada).' }
    if (Pregunta 'Dejar la termica como predeterminada fija?') {
      try {
        Set-ItemProperty -Path $clave -Name LegacyDefaultPrinterMode -Value 1 -Type DWord
        (New-Object -ComObject WScript.Network).SetDefaultPrinter($t.Name)
        Bien 'Listo: predeterminada fija.'
      } catch { Mal ('No se pudo: ' + $_.Exception.Message) }
    }
  }

  # ---------- 6. Papel ----------
  Titulo '6. Papel del driver'
  try {
    $cfg = Get-PrintConfiguration -PrinterName $t.Name -ErrorAction Stop
    if ([string]$cfg.PaperSize -match '58') { Bien ('Papel configurado: ' + $cfg.PaperSize) }
    else { Mal ('El papel configurado es "' + $cfg.PaperSize + '", no uno de 58 mm: Chrome encogera o cortara el tiquete.') }
  } catch { Info 'No se pudo leer el papel configurado.' }
  Info 'En las preferencias de la termica, el papel debe ser 58 x 3276 mm (rollo). Si no existe, 58 x 210 o 58 x 297.'
  Info 'NO elijas 80 mm, A4 ni Carta: Chrome encoge el tiquete.'
  if (Pregunta 'Abrir las preferencias de impresion para revisarlo?') {
    Start-Process -FilePath 'rundll32.exe' -ArgumentList ('printui.dll,PrintUIEntry /e /n "' + $t.Name + '"')
    if (-not $SoloDiagnostico) { Read-Host '  Cuando lo hayas guardado, pulsa Enter para seguir' | Out-Null }
  }

  # ---------- 7. Pruebas ----------
  Titulo '7. Pruebas de impresion'
  $salioWindows = $null
  if ($w -and (Pregunta 'Imprimir la PAGINA DE PRUEBA de Windows?')) {
    try {
      $r = Invoke-CimMethod -InputObject $w -MethodName PrintTestPage
      if ($r.ReturnValue -eq 0) { Info 'Enviada. Espera unos segundos.' } else { Ojo ('Windows respondio el codigo ' + $r.ReturnValue) }
    } catch { Mal ('No se pudo enviar: ' + $_.Exception.Message) }
    $salioWindows = Pregunta 'Salio papel con texto legible?'
  }
  $salioDirecta = $null
  if (Pregunta 'Imprimir la PRUEBA DIRECTA (texto ESC/POS, sin dibujar nada el driver)?') {
    try {
      Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class PgRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
  public static string Enviar(string impresora, byte[] datos) {
    IntPtr h;
    if (!OpenPrinter(impresora, out h, IntPtr.Zero)) return "OpenPrinter error " + Marshal.GetLastWin32Error();
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = "Papaghetti prueba directa";
      di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) return "StartDocPrinter error " + Marshal.GetLastWin32Error();
      StartPagePrinter(h);
      int escritos;
      bool ok = WritePrinter(h, datos, datos.Length, out escritos);
      EndPagePrinter(h);
      EndDocPrinter(h);
      return ok ? "" : "WritePrinter error " + Marshal.GetLastWin32Error();
    } finally { ClosePrinter(h); }
  }
}
"@
      $b = New-Object System.Collections.Generic.List[byte]
      $b.AddRange([byte[]](27, 64, 27, 97, 1, 29, 33, 17))
      $b.AddRange([Text.Encoding]::ASCII.GetBytes("PAPAGHETTI" + [char]10))
      $b.AddRange([byte[]](29, 33, 0))
      $b.AddRange([Text.Encoding]::ASCII.GetBytes("Prueba directa por USB" + [char]10 + "--------------------------------" + [char]10))
      $b.AddRange([byte[]](27, 97, 0))
      $b.AddRange([Text.Encoding]::ASCII.GetBytes("Si lees esto, cable, puerto y" + [char]10 + "cola funcionan." + [char]10 + "01234567890123456789012345678901" + [char]10))
      $b.AddRange([byte[]](27, 100, 5))
      $err = [PgRaw]::Enviar($t.Name, $b.ToArray())
      if ($err) { Mal ('La prueba directa no se pudo enviar: ' + $err) } else { Info 'Enviada.' }
    } catch { Mal ('La prueba directa fallo: ' + $_.Exception.Message) }
    $salioDirecta = Pregunta 'Salio la prueba directa (PAPAGHETTI en letra grande)?'
  }
  if ($salioWindows -eq $true) { Bien 'La pagina de prueba de Windows SALE: la instalacion esta bien.' }
  elseif ($salioWindows -eq $false -and $salioDirecta -eq $true) { Mal 'Sale la prueba directa pero NO la de Windows: el cable y la impresora estan bien, el DRIVER no. Reinstala el POS-58 (modelo de 58 mm) o prueba el otro driver.' }
  elseif ($salioWindows -eq $false -and $salioDirecta -eq $false) { Mal 'No sale ninguna prueba: revisa encendido, papel (la cara brillante hacia el cabezal; rasca con la una: la que se pone gris), cable y puerto USB.' }
}

# ---------- 8. Chrome sin dialogo ----------
Titulo '8. Acceso directo "Papaghetti Caja"'
$navegador = @(
  (Join-Path $env:ProgramFiles 'Google\\Chrome\\Application\\chrome.exe'),
  (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Google\\Chrome\\Application\\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\\Chrome\\Application\\chrome.exe'),
  (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft\\Edge\\Application\\msedge.exe')
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $navegador) {
  Ojo 'No encontre Chrome ni Edge instalados en la ruta normal.'
} else {
  Bien ('Navegador: ' + $navegador)
  Info 'Con este acceso directo, Chrome imprime el comprobante SIN mostrar el dialogo, en la impresora predeterminada.'
  if (Pregunta 'Crear el acceso directo "Papaghetti Caja" en el Escritorio?') {
    try {
      $escritorio = [Environment]::GetFolderPath('Desktop')
      $sh = New-Object -ComObject WScript.Shell
      $lnk = $sh.CreateShortcut((Join-Path $escritorio 'Papaghetti Caja.lnk'))
      $lnk.TargetPath = $navegador
      $lnk.Arguments = '--kiosk-printing "' + $Sitio + '/admin/pedidos"'
      $lnk.WorkingDirectory = Split-Path $navegador
      $lnk.Description = 'Papaghetti - caja con impresion directa'
      $lnk.Save()
      Bien 'Acceso directo creado en el Escritorio.'
      Info 'IMPORTANTE: cierra TODAS las ventanas de Chrome antes de abrirlo, y abre la caja siempre desde ahi.'
      Info 'La primera vez, imprime un comprobante normal y en el dialogo elige la termica, margenes Ninguno, escala 100.'
    } catch { Mal ('No se pudo crear: ' + $_.Exception.Message) }
  }
}

# ---------- 9. Informe ----------
Titulo 'Resumen'
if ($problemas.Count -eq 0) { Bien 'No se encontraron problemas.' } else { foreach ($x in $problemas) { Linea ('  - ' + $x) 'Yellow' } }
Info ('Despues: abre ' + $Sitio + '/admin/impresora e imprime el patron de prueba (la regla debe llegar a 48).')
if (-not $SoloDiagnostico) {
  try {
    $archivo = Join-Path ([Environment]::GetFolderPath('Desktop')) 'diagnostico-impresora-papaghetti.txt'
    $informe | Set-Content -Path $archivo -Encoding UTF8
    Set-Clipboard -Value ($informe -join [Environment]::NewLine)
    Linea ''
    Linea ('Informe guardado en el Escritorio (diagnostico-impresora-papaghetti.txt) y COPIADO: pegalo en WhatsApp.') 'White'
  } catch {}
} else {
  Linea ''
  Linea ('(solo diagnostico: ' + $informe.Count + ' lineas de informe)') 'White'
}
`;
}

/** El .bat completo, con finales CRLF. */
export function kitImpresora(sitio: string): string {
  return (lanzador() + powershell(sitio)).replace(/\r?\n/g, "\r\n");
}

export const NOMBRE_KIT = "preparar-impresora-papaghetti.bat";
