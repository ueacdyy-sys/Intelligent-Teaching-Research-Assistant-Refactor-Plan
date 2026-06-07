param(
  [switch] $Live,
  [int] $DelayMs = 180
)

$ErrorActionPreference = "Stop"
$script:LiveMode = [bool] $Live
$script:DelayMs = [Math]::Max(0, $DelayMs)

$Root = "C:\Users\Administrator\Desktop\Intelligent-Teaching-Research-Assistant-Refactor-Plan"
$OutDir = Join-Path $Root "visio-output"
$Vsdx = Join-Path $OutDir "Intelligent-Teaching-Research-Assistant-Readable-C4.vsdx"
$PreviewPrefix = Join-Path $OutDir "Readable-C4"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$script:W = 16.5
$script:H = 11.7

function VY { param([double] $Y) return $script:H - $Y }

function Set-Cell {
  param($Shape, [string] $Cell, [string] $Formula)
  try { $Shape.CellsU($Cell).FormulaU = $Formula } catch {}
}

function Tick {
  if (-not $script:LiveMode) { return }
  try { $script:visio.ActiveWindow.ViewFit = 1 } catch {}
  Start-Sleep -Milliseconds $script:DelayMs
}

function Style-Shape {
  param(
    $Shape,
    [string] $Fill,
    [string] $Line,
    [string] $Text = "RGB(30,37,36)",
    [double] $Font = 14,
    [bool] $Bold = $false,
    [double] $Weight = 1.2,
    [int] $FillTrans = 0,
    [int] $Align = 1
  )
  Set-Cell $Shape "FillForegnd" $Fill
  Set-Cell $Shape "LineColor" $Line
  Set-Cell $Shape "LineWeight" "$Weight pt"
  Set-Cell $Shape "Char.Color" $Text
  Set-Cell $Shape "Char.Size" "$Font pt"
  Set-Cell $Shape "Char.Style" $(if ($Bold) { "1" } else { "0" })
  Set-Cell $Shape "Para.HorzAlign" "$Align"
  Set-Cell $Shape "VerticalAlign" "1"
  Set-Cell $Shape "Rounding" "0.10 in"
  Set-Cell $Shape "LeftMargin" "0.10 in"
  Set-Cell $Shape "RightMargin" "0.10 in"
  Set-Cell $Shape "TopMargin" "0.07 in"
  Set-Cell $Shape "BottomMargin" "0.07 in"
  if ($FillTrans -gt 0) { Set-Cell $Shape "FillTransparency" "$FillTrans%" }
}

function Box {
  param(
    $Page,
    [double] $X,
    [double] $Y,
    [double] $W,
    [double] $H,
    [string] $Text,
    [string] $Fill,
    [string] $Line,
    [string] $TextColor = "RGB(30,37,36)",
    [double] $Font = 14,
    [bool] $Bold = $false,
    [double] $Weight = 1.2,
    [int] $FillTrans = 0,
    [int] $Align = 1
  )
  $shape = $Page.DrawRectangle($X, (VY ($Y + $H)), $X + $W, (VY $Y))
  $shape.Text = $Text
  Style-Shape $shape $Fill $Line $TextColor $Font $Bold $Weight $FillTrans $Align
  if ($Text -ne "") { Tick }
  return $shape
}

function Line {
  param(
    $Page,
    [double] $X1,
    [double] $Y1,
    [double] $X2,
    [double] $Y2,
    [string] $Color = "RGB(84,96,100)",
    [string] $Arrow = "13",
    [double] $Weight = 1.5,
    [bool] $Dash = $false
  )
  $line = $Page.DrawLine($X1, (VY $Y1), $X2, (VY $Y2))
  Set-Cell $line "LineColor" $Color
  Set-Cell $line "LineWeight" "$Weight pt"
  Set-Cell $line "EndArrow" $Arrow
  if ($Dash) { Set-Cell $line "LinePattern" "2" }
  Tick
  return $line
}

function Elbow {
  param($Page, [double[]] $Points, [string] $Color = "RGB(84,96,100)", [double] $Weight = 1.5, [bool] $Dash = $false)
  for ($i = 0; $i -lt ($Points.Count - 2); $i += 2) {
    $isLast = ($i -eq ($Points.Count - 4))
    $arrow = if ($isLast) { "13" } else { "0" }
    Line $Page $Points[$i] $Points[$i + 1] $Points[$i + 2] $Points[$i + 3] $Color $arrow $Weight $Dash | Out-Null
  }
}

function Header {
  param($Page, [string] $No, [string] $Title, [string] $Subtitle)
  Box $Page 0.45 0.35 1.15 0.55 $No "RGB(30,39,43)" "RGB(30,39,43)" "RGB(255,255,255)" 18 $true 0.8 | Out-Null
  Box $Page 1.75 0.35 14.0 0.55 $Title "RGB(250,249,246)" "RGB(250,249,246)" "RGB(30,39,43)" 22 $true 0.3 0 0 | Out-Null
  Box $Page 1.75 0.98 14.0 0.36 $Subtitle "RGB(250,249,246)" "RGB(250,249,246)" "RGB(84,96,100)" 14 $false 0.3 0 0 | Out-Null
}

function New-Page {
  param($Doc, [string] $Name)
  if ($Doc.Pages.Count -eq 1 -and $Doc.Pages.Item(1).Shapes.Count -eq 0) {
    $page = $Doc.Pages.Item(1)
  } else {
    $page = $Doc.Pages.Add()
  }
  $page.Name = $Name
  $page.PageSheet.CellsU("PageWidth").ResultIU = $script:W
  $page.PageSheet.CellsU("PageHeight").ResultIU = $script:H
  Box $page 0 0 $script:W $script:H "" "RGB(250,249,246)" "RGB(250,249,246)" | Out-Null
  return $page
}

$cInk = "RGB(30,39,43)"
$cBlueF = "RGB(227,241,250)"
$cBlueL = "RGB(43,110,141)"
$cGreenF = "RGB(229,244,237)"
$cGreenL = "RGB(47,111,89)"
$cAmberF = "RGB(255,246,218)"
$cAmberL = "RGB(140,101,23)"
$cPurpleF = "RGB(242,237,249)"
$cPurpleL = "RGB(109,90,133)"
$cGrayF = "RGB(238,243,244)"
$cGrayL = "RGB(104,116,119)"
$cRedF = "RGB(255,238,233)"
$cRedL = "RGB(154,68,60)"
$cWhite = "RGB(255,253,248)"

$script:visio = New-Object -ComObject Visio.Application
$visio = $script:visio
$visio.Visible = $script:LiveMode
$doc = $visio.Documents.Add("")

try {
  # Page 1: Context
  $p = New-Page $doc "01 系统上下文"
  Header $p "01" "系统上下文：谁使用它，它连接谁" "这一页只表达参与者、目标系统和外部系统，不塞模块细节。"

  Box $p 6.0 3.25 4.5 2.2 "智能教研助手`nTeaching Research Assistant" $cGreenF $cGreenL "RGB(24,78,55)" 20 $true 2.2 | Out-Null
  Box $p 6.05 5.65 4.4 0.85 "核心目标：教学 + 科研 + Agent 执行`n权限、审批、证据链统一管控" $cWhite $cGreenL "RGB(42,73,61)" 15 $true 1.0 | Out-Null

  Box $p 0.8 2.4 2.6 0.9 "教师" $cBlueF $cBlueL "RGB(31,78,102)" 18 $true 1.6 | Out-Null
  Box $p 0.8 4.0 2.6 0.9 "学生" $cBlueF $cBlueL "RGB(31,78,102)" 18 $true 1.6 | Out-Null
  Box $p 0.8 5.6 2.6 0.9 "管理员" $cBlueF $cBlueL "RGB(31,78,102)" 18 $true 1.6 | Out-Null
  Box $p 0.8 7.2 2.6 0.9 "移动/外部入口" $cBlueF $cBlueL "RGB(31,78,102)" 16 $true 1.6 | Out-Null

  Box $p 12.3 2.0 3.2 0.9 "LLM / OCR API" $cPurpleF $cPurpleL "RGB(72,54,96)" 17 $true 1.6 | Out-Null
  Box $p 12.3 3.75 3.2 0.9 "Office / Visio" $cPurpleF $cPurpleL "RGB(72,54,96)" 17 $true 1.6 | Out-Null
  Box $p 12.3 5.5 3.2 0.9 "CLI / Browser" $cAmberF $cAmberL "RGB(86,61,18)" 17 $true 1.6 | Out-Null
  Box $p 12.3 7.25 3.2 0.9 "本地文件 / 知识库" $cGrayF $cGrayL "RGB(57,68,70)" 16 $true 1.6 | Out-Null

  Elbow $p @(3.4,2.85, 5.2,2.85, 5.2,4.0, 6.0,4.0) $cBlueL 1.8
  Line $p 3.4 4.45 6.0 4.45 $cBlueL "13" 1.8 | Out-Null
  Elbow $p @(3.4,6.05, 5.2,6.05, 5.2,4.9, 6.0,4.9) $cBlueL 1.8
  Elbow $p @(3.4,7.65, 5.4,7.65, 5.4,5.25, 6.0,5.25) $cBlueL 1.8
  Elbow $p @(10.5,3.75, 11.35,3.75, 11.35,2.45, 12.3,2.45) $cPurpleL 1.8
  Line $p 10.5 4.2 12.3 4.2 $cPurpleL "13" 1.8 | Out-Null
  Elbow $p @(10.5,4.75, 11.35,4.75, 11.35,5.95, 12.3,5.95) $cAmberL 1.8
  Elbow $p @(10.5,5.15, 11.2,5.15, 11.2,7.7, 12.3,7.7) $cGrayL 1.8

  Box $p 0.85 9.25 14.7 0.9 "读图规则：外部入口只提交命令；工具、模型、文件访问必须经过 Agent Harness；学生侧不暴露科研和工具执行能力。" $cRedF $cRedL "RGB(107,42,37)" 16 $true 1.2 | Out-Null

  # Page 2: Containers
  $p = New-Page $doc "02 容器架构"
  Header $p "02" "容器架构：大模块怎么协作" "每个框是一个可独立治理的容器/子系统；箭头只表达主调用链。"

  Box $p 0.95 2.15 3.0 1.15 "Workbench UI`n教师端 / 学生端" $cBlueF $cBlueL "RGB(31,78,102)" 18 $true 1.8 | Out-Null
  Box $p 4.8 2.15 3.0 1.15 "API Gateway`nBFF + Auth" $cGreenF $cGreenL "RGB(24,78,55)" 18 $true 1.8 | Out-Null
  Box $p 8.65 2.15 3.0 1.15 "Command Router`n用例分诊" $cGreenF $cGreenL "RGB(24,78,55)" 18 $true 1.8 | Out-Null
  Box $p 12.5 2.15 3.0 1.15 "Workflow`n任务 / 队列 / 审批" $cAmberF $cAmberL "RGB(86,61,18)" 17 $true 1.8 | Out-Null

  Box $p 1.35 5.0 3.5 1.25 "Teaching Core" $cWhite $cGreenL "RGB(42,73,61)" 19 $true 1.7 | Out-Null
  Box $p 6.0 5.0 3.5 1.25 "Student Profile" $cWhite $cGreenL "RGB(42,73,61)" 19 $true 1.7 | Out-Null
  Box $p 10.65 5.0 3.5 1.25 "Research Core" $cPurpleF $cPurpleL "RGB(72,54,96)" 19 $true 1.7 | Out-Null

  Box $p 2.05 8.05 5.0 1.25 "Agent Orchestration`nLeadAgent / Worker / Skill" $cAmberF $cAmberL "RGB(86,61,18)" 18 $true 1.8 | Out-Null
  Box $p 8.75 8.05 5.0 1.25 "Agent Harness`n权限 / 沙箱 / 证据 / 回滚" $cAmberF $cAmberL "RGB(86,61,18)" 18 $true 1.8 | Out-Null

  Line $p 3.95 2.72 4.8 2.72 $cGreenL "13" 1.9 | Out-Null
  Line $p 7.8 2.72 8.65 2.72 $cGreenL "13" 1.9 | Out-Null
  Line $p 11.65 2.72 12.5 2.72 $cAmberL "13" 1.9 | Out-Null

  Line $p 10.15 3.3 10.15 4.15 $cGreenL "0" 1.7 | Out-Null
  Line $p 3.1 4.15 12.4 4.15 $cGreenL "0" 1.7 | Out-Null
  Line $p 3.1 4.15 3.1 5.0 $cGreenL "13" 1.7 | Out-Null
  Line $p 7.75 4.15 7.75 5.0 $cGreenL "13" 1.7 | Out-Null
  Line $p 12.4 4.15 12.4 5.0 $cPurpleL "13" 1.7 | Out-Null

  Line $p 7.75 6.25 7.75 7.2 $cAmberL "0" 1.7 | Out-Null
  Line $p 4.55 7.2 11.25 7.2 $cAmberL "0" 1.7 | Out-Null
  Line $p 4.55 7.2 4.55 8.05 $cAmberL "13" 1.7 | Out-Null
  Line $p 11.25 7.2 11.25 8.05 $cAmberL "13" 1.7 | Out-Null
  Line $p 7.05 8.68 8.75 8.68 $cAmberL "13" 1.9 | Out-Null

  Box $p 0.95 10.05 14.55 0.85 "数据存储、权限细节、Evidence 单独见第 04 页；本页不画底层数据库，避免主架构线穿图。" $cGrayF $cGrayL "RGB(57,68,70)" 15 $true 1.2 | Out-Null

  # Page 3: Harness flow
  $p = New-Page $doc "03 Agent Harness"
  Header $p "03" "Agent Harness：AI 能做什么，谁来兜底" "这页只画受控执行链路：命令、分诊、审批、执行、证据、交付。"

  Box $p 1.05 2.25 3.55 1.25 "1 命令输入`n自然语言 / API" $cAmberF $cAmberL "RGB(86,61,18)" 18 $true 1.7 | Out-Null
  Box $p 6.0 2.25 3.55 1.25 "2 LeadAgent 分诊`n任务拆解 / 风险识别" $cAmberF $cAmberL "RGB(86,61,18)" 18 $true 1.7 | Out-Null
  Box $p 10.95 2.25 3.55 1.25 "3 策略与审批`n权限 / 预算 / 人审" $cAmberF $cAmberL "RGB(86,61,18)" 18 $true 1.7 | Out-Null
  Box $p 10.95 5.0 3.55 1.25 "4 Worker + Skill`n教学 / 科研 / 工具" $cAmberF $cAmberL "RGB(86,61,18)" 18 $true 1.7 | Out-Null
  Box $p 6.0 5.0 3.55 1.25 "5 工具适配`nAPI / CLI / File" $cAmberF $cAmberL "RGB(86,61,18)" 18 $true 1.7 | Out-Null
  Box $p 1.05 5.0 3.55 1.25 "6 结果交付`n证据 / 回滚 / 通知" $cAmberF $cAmberL "RGB(86,61,18)" 18 $true 1.7 | Out-Null

  Line $p 4.6 2.88 6.0 2.88 $cAmberL "13" 1.9 | Out-Null
  Line $p 9.55 2.88 10.95 2.88 $cAmberL "13" 1.9 | Out-Null
  Line $p 12.72 3.5 12.72 5.0 $cAmberL "13" 1.9 | Out-Null
  Line $p 10.95 5.62 9.55 5.62 $cAmberL "13" 1.9 | Out-Null
  Line $p 6.0 5.62 4.6 5.62 $cAmberL "13" 1.9 | Out-Null

  Box $p 1.05 7.35 3.35 1.0 "只读快路径`n教学资料 / 练习 / 知识" $cGreenF $cGreenL "RGB(24,78,55)" 17 $true 1.5 | Out-Null
  Box $p 5.2 7.35 3.35 1.0 "高风险路径`n写入 / 发布 / 外部工具" $cRedF $cRedL "RGB(107,42,37)" 17 $true 1.5 | Out-Null
  Box $p 9.35 7.35 3.35 1.0 "执行证据`n引用 / 日志 / 截图" $cGrayF $cGrayL "RGB(57,68,70)" 17 $true 1.5 | Out-Null
  Box $p 13.0 7.35 2.6 1.0 "回滚边界`n暂停 / 重试" $cGrayF $cGrayL "RGB(57,68,70)" 17 $true 1.5 | Out-Null

  Line $p 7.78 3.5 7.78 7.35 $cRedL "13" 1.5 | Out-Null
  Elbow $p @(7.78,3.5, 7.78,6.85, 2.72,6.85, 2.72,7.35) $cGreenL 1.5
  Elbow $p @(7.78,6.25, 7.78,6.85, 11.02,6.85, 11.02,7.35) $cGrayL 1.5
  Elbow $p @(7.78,6.25, 7.78,6.85, 14.3,6.85, 14.3,7.35) $cGrayL 1.5

  Box $p 0.9 9.35 14.7 0.9 "硬规则：Agent 不直接碰 shell / 文件 / 浏览器 / Office；AI Worker 不写主库；外部动作必须有权限、预算、审批状态和 Evidence。" $cRedF $cRedL "RGB(107,42,37)" 18 $true 1.8 | Out-Null

  # Page 4: Data and boundary
  $p = New-Page $doc "04 数据权限边界"
  Header $p "04" "数据与权限边界：哪些能流动，哪些不能碰" "把公开库、私密库、学生档案、工具执行分开，避免一张大表或一个 Agent 乱穿。"

  Box $p 0.95 2.25 3.25 1.1 "学生档案`nStudent Profile" $cBlueF $cBlueL "RGB(31,78,102)" 17 $true 1.7 | Out-Null
  Box $p 0.95 4.7 3.25 1.1 "教学资料`nTeaching Material" $cGreenF $cGreenL "RGB(24,78,55)" 17 $true 1.7 | Out-Null
  Box $p 0.95 7.15 3.25 1.1 "科研私密库`nPrivate Knowledge" $cPurpleF $cPurpleL "RGB(72,54,96)" 17 $true 1.7 | Out-Null

  Box $p 6.2 2.7 4.1 1.25 "Access Policy`n角色 / 班级 / 可见范围" $cAmberF $cAmberL "RGB(86,61,18)" 18 $true 1.8 | Out-Null
  Box $p 6.2 5.55 4.1 1.25 "Evidence Log`n谁在何时因何访问" $cGrayF $cGrayL "RGB(57,68,70)" 18 $true 1.8 | Out-Null
  Box $p 6.2 8.4 4.1 1.25 "Event Bus`nprofile / teaching / research" $cGrayF $cGrayL "RGB(57,68,70)" 18 $true 1.8 | Out-Null

  Box $p 12.35 2.25 3.2 1.1 "教师工作台" $cBlueF $cBlueL "RGB(31,78,102)" 18 $true 1.7 | Out-Null
  Box $p 12.35 4.7 3.2 1.1 "学生端" $cBlueF $cBlueL "RGB(31,78,102)" 18 $true 1.7 | Out-Null
  Box $p 12.35 7.15 3.2 1.1 "Research Agent" $cPurpleF $cPurpleL "RGB(72,54,96)" 18 $true 1.7 | Out-Null

  Elbow $p @(4.2,2.8, 5.25,2.8, 5.25,3.32, 6.2,3.32) $cAmberL 1.7
  Elbow $p @(4.2,5.25, 5.25,5.25, 5.25,3.55, 6.2,3.55) $cAmberL 1.7
  Elbow $p @(4.2,7.7, 5.25,7.7, 5.25,3.8, 6.2,3.8) $cAmberL 1.7
  Elbow $p @(10.3,3.32, 11.25,3.32, 11.25,2.8, 12.35,2.8) $cBlueL 1.7
  Elbow $p @(10.3,3.55, 11.25,3.55, 11.25,5.25, 12.35,5.25) $cBlueL 1.7
  Elbow $p @(10.3,3.8, 11.25,3.8, 11.25,7.7, 12.35,7.7) $cPurpleL 1.7
  Line $p 8.25 3.95 8.25 5.55 $cGrayL "13" 1.6 | Out-Null
  Line $p 8.25 6.8 8.25 8.4 $cGrayL "13" 1.6 | Out-Null

  Box $p 0.95 9.55 4.0 0.8 "禁止：学生端读取科研私密库" $cRedF $cRedL "RGB(107,42,37)" 18 $true 1.4 | Out-Null
  Box $p 5.65 9.55 4.0 0.8 "禁止：Agent 绕过 Harness 执行工具" $cRedF $cRedL "RGB(107,42,37)" 18 $true 1.4 | Out-Null
  Box $p 10.35 9.55 4.0 0.8 "禁止：AI Worker 直接写主库" $cRedF $cRedL "RGB(107,42,37)" 18 $true 1.4 | Out-Null

  if (Test-Path -LiteralPath $Vsdx) { Remove-Item -LiteralPath $Vsdx -Force }
  Get-ChildItem -LiteralPath $OutDir -Filter "Readable-C4-*.png" | Remove-Item -Force
  $doc.SaveAs($Vsdx)
  for ($i = 1; $i -le $doc.Pages.Count; $i++) {
    $doc.Pages.Item($i).Export(("{0}-{1:00}.png" -f $PreviewPrefix, $i))
  }
}
finally {
  if ($script:LiveMode) {
    try { $visio.Visible = $true } catch {}
    try { $visio.ActiveWindow.ViewFit = 1 } catch {}
  } else {
    if ($doc) { $doc.Close() }
    if ($visio) { $visio.Quit() }
  }
}

[pscustomobject]@{
  Vsdx = $Vsdx
  Preview1 = "{0}-01.png" -f $PreviewPrefix
  Preview2 = "{0}-02.png" -f $PreviewPrefix
  Preview3 = "{0}-03.png" -f $PreviewPrefix
  Preview4 = "{0}-04.png" -f $PreviewPrefix
} | Format-List
