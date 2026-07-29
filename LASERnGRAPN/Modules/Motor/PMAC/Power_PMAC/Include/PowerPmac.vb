Enum DTK_MODE_TYPE
    DM_GPASCII = 0
    DM_GETSENDS_0 = 1
    DM_GETSENDS_1 = 2
    DM_GETSENDS_2 = 3
    DM_GETSENDS_3 = 4
    DM_GETSENDS_4 = 5
    DM_SECURE_SHELL = 10
End Enum

Enum DTK_STATUS
    DS_Ok = 0
    DS_Exception = 1
    DS_TimeOut = 2
    DS_Connected = 3
    DS_NotConnected = 4
    DS_Failed = 5
    DS_InvalidDevice = 11
    DS_DataRemains = 21
    DS_CmdLengthExceeds = 23
    DS_ResLengthExceeds = 24
    DS_RunningDownload = 41
    DS_RunningRead = 42
    DS_DATimeOut = 102
    DS_DANotConnected = 104
    DS_DAFailed = 105
End Enum

Enum DTK_RESET_TYPE
    DR_Reset = 0
    DR_FullReset = 1
End Enum

Enum DTK_DOWNLOAD_TYPE
    DT_Progress = 0
    DT_StringA = 1
    DT_StringW = 2
End Enum

Enum DTK_DOWNLOAD_MODE
    DM_File_Download = 0
    DM_File_DownExec = 1
    DM_File_DownExecDel = 2
    DM_File_DirectBuffer = 6
    DM_File_DownAuto = 11
End Enum

Public Structure COPYDATASTRUCT
    Public dwData As IntPtr
    Public cdData As UInt32
    Public IpData As String
End Structure

Public Class PowerPmac
    Public Delegate Sub PDOWNLOAD_PROGRESS(ByVal nPercent As Int32)
    Public Delegate Sub PDOWNLOAD_MESSAGE_A(ByVal lpMessage As String)
    Public Delegate Sub PRECEIVE_PROC_A(ByVal lpReveive As String)

    Public Const WM_MESSAGE_DOWNLOAD As UInt32 = &H1216
    Public Const WM_MESSAGE_RECEIVE As UInt32 = &H1217

#If (x64) Then   ' x64는 속성에서 조건부 컴파일 기호란에 추가
    ' 라이브러리 오픈
    ' 인자를 NULL로 할 경우 DTKDeviceSelect 함수를 사용하여 장치를 연결해야 한다.
    Declare Function DTKPowerPmacOpen Lib "PowerPmac64.dll" (ByVal dwIPAddress As UInt32, ByVal uMode As UInt32) As UInt32

    ' 라이브리리 클로즈
    Declare Function DTKPowerPmacClose Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32) As UInt32

    ' 등록된 디바이스 갯수
    Declare Function DTKGetDeviceCount Lib "PowerPmac64.dll" (ByRef pnDeviceCount As Int32) As UInt32

    ' IP Address 확인
    Declare Function DTKGetIPAddress Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByRef pdwIPAddress As UInt32) As UInt32

    ' 장치를 연결
    Declare Function DTKConnect Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32) As UInt32

    ' 장치를 해제
    Declare Function DTKDisconnect Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32) As UInt32

    ' Echo Mode 설정
    Declare Function DTKSetEchoMode Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, uEchoMode As UInt32) As UInt32

    ' Echo Mode 확인
    Declare Function DTKGetEchoMode Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByRef puEchoMode As UInt32) As UInt32

     ' Socket Timeout 설정
    Declare Function DTKSetTimeout Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByVal uSendTimeout As UInt32, ByVal uReceiveTimeout As UInt32) As UInt32

    ' Socket Timeout 확인
    Declare Function DTKGetTimeout Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByRef puSendTimeout As UInt32, ByRef puReceiveTimeout As UInt32) As UInt32


    ' 장치가 연결되었는지 확인
    Declare Function DTKIsConnected Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByRef pbConnected As Int32) As UInt32

    Declare Function DTKGetResponseA Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByRef lpCommand As Byte, ByRef lpResponse As Byte, ByVal nLength As Int32) As UInt32

    Declare Function DTKSendCommandA Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByRef lpCommand As Byte) As UInt32

    Declare Function DTKAbort Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32) As UInt32

    Declare Function DTKDownloadA Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByRef lpwDownload As Byte, ByVal uDowoload As UInt32, hDownloadWnd As UInt32, ByVal lpDownloadProgress As PDOWNLOAD_PROGRESS, ByVal lpDownloadMessage As PDOWNLOAD_MESSAGE_A) As UInt32

    Declare Function DTKSetReceiveA Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, hReceiveWnd As UInt32, ByVal lpReveiveProc As PRECEIVE_PROC_A) As UInt32

    ' 아래의 함수군은 CPU 통신셋업후 사용 가능
    Declare Function DTKGetUserMem Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByVal uAddress As UInt32, ByVal nSize As Int32, ByRef pValue As Byte) As UInt32

    Declare Function DTKSetUserMem Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByVal uAddress As UInt32, ByVal nSize As Int32, ByRef pValue As Byte) As UInt32

    Declare Function DTKGetUserMemChar Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByRef pchValue As Byte) As UInt32

    Declare Function DTKSetUserMemChar Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByVal chValue As Byte) As UInt32

    Declare Function DTKGetUserMemShort Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByRef pnValue As Uint16) As UInt32

    Declare Function DTKSetUserMemShort Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByVal nValue As Int16) As UInt32

    Declare Function DTKGetUserMemInteger Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByRef pnValue As Int32) As UInt32

    Declare Function DTKSetUserMemInteger Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByVal nValue As Int32) As UInt32

    Declare Function DTKGetUserMemFloat Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByRef pfVlaue As Single) As UInt32

    Declare Function DTKSetUserMemFloat Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByVal fValue As Single) As UInt32

    Declare Function DTKGetUserMemDouble Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByRef pdValue As Double) As UInt32

    Declare Function DTKSetUserMemDouble Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByVal dValue As Double) As UInt32

    Declare Function DTKLockGpAscii Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32) As UInt32
    Declare Function DTKUnlockGpAscii Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32) As UInt32
    Declare Function DTKLockUserMem Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32) As UInt32
    Declare Function DTKUnlockUserMem Lib "PowerPmac64.dll" (ByVal uDeviceID As UInt32) As UInt32
#Else
    ' 라이브러리 오픈
    ' 인자를 NULL로 할 경우 DTKDeviceSelect 함수를 사용하여 장치를 연결해야 한다.
    Declare Function DTKPowerPmacOpen Lib "PowerPmac32.dll" (ByVal dwIPAddress As UInt32, ByVal uMode As UInt32) As UInt32

    ' 라이브리리 클로즈
    Declare Function DTKPowerPmacClose Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32) As UInt32

    ' 등록된 디바이스 갯수
    Declare Function DTKGetDeviceCount Lib "PowerPmac32.dll" (ByRef pnDeviceCount As Int32) As UInt32

    ' IP Address 확인
    Declare Function DTKGetIPAddress Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByRef pdwIPAddress As UInt32) As UInt32

    ' 장치를 연결
    Declare Function DTKConnect Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32) As UInt32

    ' 장치를 해제
    Declare Function DTKDisconnect Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32) As UInt32

    ' Echo Mode 설정
    Declare Function DTKSetEchoMode Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, uEchoMode As UInt32) As UInt32

    ' Echo Mode 확인
    Declare Function DTKGetEchoMode Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByRef puEchoMode As UInt32) As UInt32

    ' Socket Timeout 설정
    Declare Function DTKSetTimeout Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByVal uSendTimeout As UInt32, ByVal uReceiveTimeout As UInt32) As UInt32

    ' Socket Timeout 확인
    Declare Function DTKGetTimeout Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByRef puSendTimeout As UInt32, ByRef puReceiveTimeout As UInt32) As UInt32

    ' 장치가 연결되었는지 확인
    Declare Function DTKIsConnected Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByRef pbConnected As Int32) As UInt32

    Declare Function DTKGetResponseA Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByRef lpCommand As Byte, ByRef lpResponse As Byte, ByVal nLength As Int32) As UInt32

    Declare Function DTKSendCommandA Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByRef lpCommand As Byte) As UInt32

    Declare Function DTKAbort Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32) As UInt32

    Declare Function DTKDownloadA Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByRef lpwDownload As Byte, ByVal uDowoload As UInt32, hDownloadWnd As UInt32, ByVal lpDownloadProgress As PDOWNLOAD_PROGRESS, ByVal lpDownloadMessage As PDOWNLOAD_MESSAGE_A) As UInt32

    Declare Function DTKSetReceiveA Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, hReceiveWnd As UInt32, ByVal lpReveiveProc As PRECEIVE_PROC_A) As UInt32

    ' 아래의 함수군은 CPU 통신셋업후 사용 가능
    Declare Function DTKGetUserMem Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByVal uAddress As UInt32, ByVal nSize As Int32, ByRef pValue As Byte) As UInt32

    Declare Function DTKSetUserMem Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByVal uAddress As UInt32, ByVal nSize As Int32, ByRef pValue As Byte) As UInt32

    Declare Function DTKGetUserMemChar Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByRef pchValue As Byte) As UInt32

    Declare Function DTKSetUserMemChar Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByVal chValue As Byte) As UInt32

    Declare Function DTKGetUserMemShort Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByRef pnValue As UInt16) As UInt32

    Declare Function DTKSetUserMemShort Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByVal nValue As Int16) As UInt32

    Declare Function DTKGetUserMemInteger Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByRef pnValue As Int32) As UInt32

    Declare Function DTKSetUserMemInteger Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByVal nValue As Int32) As UInt32

    Declare Function DTKGetUserMemFloat Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByRef pfVlaue As Single) As UInt32

    Declare Function DTKSetUserMemFloat Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByVal fValue As Single) As UInt32

    Declare Function DTKGetUserMemDouble Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByRef pdValue As Double) As UInt32

    Declare Function DTKSetUserMemDouble Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32, ByVal nIndex As Int32, ByVal dValue As Double) As UInt32

    Declare Function DTKLockGpAscii Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32) As UInt32
    Declare Function DTKUnlockGpAscii Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32) As UInt32
    Declare Function DTKLockUserMem Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32) As UInt32
    Declare Function DTKUnlockUserMem Lib "PowerPmac32.dll" (ByVal uDeviceID As UInt32) As UInt32
#End If

End Class

