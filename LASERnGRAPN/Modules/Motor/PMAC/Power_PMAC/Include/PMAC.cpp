#include "pch.h"
#include "PMAC.h"
#include "PowerPmac.h"
#include "PowerPmacDef.h"

#pragma comment(lib, "PowerPmac64.lib")

PMAC::PMAC() { InitializeCriticalSectionAndSpinCount(&_cs, 2000); }

PMAC::~PMAC()
{
    Close();
    DeleteCriticalSection(&_cs);
}

BOOL PMAC::Connect(const CString &IP) {
  CSPtr CS(_cs);

  HighOrderVector<CString> Parts = StrUtil::Tokenizer(IP, _T('.'));

  DWORD HexIP = 0;
  Parts.foreach ([&HexIP](const CString &IPParts) {
    HexIP <<= 8;
    HexIP += _ttoi(IPParts);
  });

  m_DeviceID = DTKPowerPmacOpen(HexIP, DM_GPASCII);
  return DTKConnect(m_DeviceID) == DS_Ok;
}

BOOL PMAC::Close() {
  if (m_DeviceID == NOT_CONNECTED)
    return TRUE;

  CSPtr CS(_cs);

  BOOL Ret1 = DTKDisconnect(m_DeviceID);
  BOOL Ret2 = DTKPowerPmacClose(m_DeviceID);

  m_DeviceID = NOT_CONNECTED;

  return Ret1 && Ret2;
}

BOOL PMAC::Write(const CString &Command, DWORD WaitTick) {
  if (m_DeviceID == NOT_CONNECTED)
    return FALSE;

  CSPtr CS(_cs);

  UINT Ret = DTKSendCommand(m_DeviceID, (LPTSTR)(LPCTSTR)Command);

  if (Ret == DS_Ok && WaitTick > 0)
    Sleep(WaitTick);

  return Ret == DS_Ok;
}

BOOL PMAC::Read(const CString &Command, CString &Ret) {
  if (m_DeviceID == NOT_CONNECTED)
    return FALSE;

  CSPtr CS(_cs);

  TCHAR RetBuffer[1024] = _T(" ");

  UINT Res = DTKGetResponse(m_DeviceID, (LPWSTR)(LPCWSTR)Command,
                            (LPTSTR)RetBuffer, 1024);
  if (Res != 0)
    return FALSE;

  CString RetString = RetBuffer;
  RetString.Remove(_T('\n'));
  RetString.Remove(_T('\r'));

  if (RetString.IsEmpty())
    return FALSE;

  auto tokens = StrUtil::Tokenizer(RetString, _T('='));
  if (tokens.size() >= 2) {
    Ret = tokens.at(1);
    m_HasCommError = FALSE;
    m_LastError = _T("");
  } else {
    // Error check: stdin:855489:1: error #21: ILLEGAL PARAMETER: Mtr1_Pos
    if (RetString.Find(_T("error")) != -1) {
      m_HasCommError = TRUE;
      m_LastError = RetString;
    }
    Ret = RetString;
    return FALSE;
  }

  return TRUE;
}

/**
* @brief PMAC 프로그램 버퍼 생성
*
* open prog n
* ...
* close
*/
CString PMAC::BuildProgramBuffer(const std::vector<CString>& lines, int programNo)
{
    CString program;
//    program.AppendFormat(_T("open prog %d\n"), programNo);

    for (const auto& ln : lines)
    {
        program += ln;
        program += _T("\n");
    }

//    program += _T("close\n");

    return program;
}

/**
    @brief  GCode 프로그램 업로드
    @param  lines     - GCode 라인
    @param  programNo - 프로그램 번호
    @retval           - TRUE
**/
BOOL PMAC::UploadProgram(const std::vector<CString>& lines, int programNo)
{
    if (m_DeviceID == NOT_CONNECTED)
        return FALSE;

    if (lines.empty())
        return FALSE;

    CSPtr CS(_cs);

    CString program = BuildProgramBuffer(lines, programNo);

    int nCount = program.GetLength();
    int nByte = program.GetLength() * sizeof(TCHAR);

    UINT ret = DTKSendCommand(m_DeviceID, (LPTSTR)(LPCTSTR)program);
    return ret == DS_Ok;
}


BOOL PMAC::UploadChunk(const std::vector<CString>& lines)
{
    if (m_DeviceID == NOT_CONNECTED)
        return FALSE;

    CString buffer;

    for (const auto& ln : lines)
    {
        buffer += ln;
        buffer += _T("\n");
    }

    UINT ret = DTKSendCommand(m_DeviceID, (LPTSTR)(LPCTSTR)buffer);
    return ret == DS_Ok;
}

BOOL PMAC::CloseAllBuffers()
{
    if (m_DeviceID == NOT_CONNECTED)
        return FALSE;

    CString buffer;
    buffer.Format(_T("close")); // 혹시 몰라서 prog 1 버퍼 닫기
    UINT ret = DTKSendCommand(m_DeviceID, (LPTSTR)(LPCTSTR)buffer);
    Sleep(100);
    buffer.Format(_T("close all buffers")); // 모든 버퍼 닫기
    ret = DTKSendCommand(m_DeviceID, (LPTSTR)(LPCTSTR)buffer);
    Sleep(100);
    buffer.Format(_T("open prog 1 close"));// prog 1 버퍼 지우기
    ret = DTKSendCommand(m_DeviceID, (LPTSTR)(LPCTSTR)buffer);

    return ret == DS_Ok;
}

namespace PMACUtil {
void SetParameter(const CString &Axis, Motor &m) {
  m.SetAttribute(_T("SERVO"), INI_PMAC.GetString(Axis, _T("SERVO")));
  m.SetAttribute(_T("HOME"), INI_PMAC.GetString(Axis, _T("HOME")));
  m.SetAttribute(_T("STOP"), INI_PMAC.GetString(Axis, _T("AllStop")));
  m.SetAttribute(_T("ALARM_RESET"),
                 INI_PMAC.GetString(Axis, _T("ALARM_RESET")));
  m.SetAttribute(_T("MOVE_MODE"), INI_PMAC.GetString(Axis, _T("MOVE_MODE")));
  m.SetAttribute(_T("TARGET_POS"), INI_PMAC.GetString(Axis, _T("TARGET_POS")));
  m.SetAttribute(_T("MOVE_SPEED"), INI_PMAC.GetString(Axis, _T("MOVE_SPEED")));
  m.SetAttribute(_T("MOVE_ACC_DEC"),
                 INI_PMAC.GetString(Axis, _T("MOVE_ACC_DEC")));
  m.SetAttribute(_T("JOG_MODE"), INI_PMAC.GetString(Axis, _T("JOG_MODE")));
  m.SetAttribute(_T("JOG_SPEED"), INI_PMAC.GetString(Axis, _T("JOG_SPEED")));
  m.SetAttribute(_T("JOG_ACC_DEC"),
                 INI_PMAC.GetString(Axis, _T("JOG_ACC_DEC")));
  m.SetAttribute(_T("NOW_POS"), INI_PMAC.GetString(Axis, _T("NOW_POS")));
  m.SetAttribute(_T("STATUS"), INI_PMAC.GetString(Axis, _T("STATUS")));

  m.SetAttribute(_T("SPEED"), 10000); // 5ms
}
} // namespace PMACUtil