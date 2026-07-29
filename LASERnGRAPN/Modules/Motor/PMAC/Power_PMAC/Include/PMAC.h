#pragma once
#include "PowerPmac.h"
#include <vector>

#define NOT_CONNECTED (0xFFFFFFFF)

class PMAC {
public:
	PMAC();
	~PMAC();

	BOOL Connect(const CString& IP);
	BOOL Close();

	/**
   * @brief 단일 명령 전송
   */
	BOOL Write(const CString& Command, DWORD WaitTick = 30);
	/**
   * @brief 명령 응답 읽기
   */
	BOOL Read(const CString& Command, CString& Ret);
	BOOL HasCommError() { return m_HasCommError; }
	CString GetCommError() { return m_LastError; }

	template <typename T>
	BOOL Write(const CString& Command, const T& Value, DWORD WaitTick = 30) {
		if (m_DeviceID == NOT_CONNECTED)
			return FALSE;

		CSPtr CS(_cs);

		CString CommandWithValue =
			StrC(_T("%s=%s"), Command, StrUtil::ToString(Value));

		UINT Ret = DTKSendCommand(m_DeviceID, (LPTSTR)(LPCTSTR)CommandWithValue);

		if (Ret == DS_Ok)
			Sleep(WaitTick);

		return Ret == DS_Ok;
	}

	/**
	 * @brief GCode 프로그램 업로드 (대량 전송)
	 *
	 * @param lines GCode 라인
	 * @param programNo PMAC 프로그램 번호
	 */
	BOOL UploadProgram(
		const std::vector<CString>& lines,
		int programNo = 1);



	BOOL UploadChunk(const std::vector<CString>& lines);

	BOOL CloseAllBuffers();

private:

	/**
	* @brief PMAC Program 문자열 생성
	*/
	CString BuildProgramBuffer(
		const std::vector<CString>& lines,
		int programNo);

	BOOL m_HasCommError = FALSE;
	CString m_LastError;

	DWORD m_DeviceID = NOT_CONNECTED;
	CRITICAL_SECTION _cs;
};



namespace PMACUtil {
	void SetParameter(const CString& Axis, Motor& m);
}