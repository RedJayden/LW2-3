#include "GCode.h"
#include "pch.h"
#include <algorithm>

GCode::GCode(PMAC* pPMAC) : m_p(pPMAC) {
	InitializeCriticalSectionAndSpinCount(&_cs, 3000);

	_Init();
}

GCode::~GCode() {
	m_p = NULL;
	DeleteCriticalSection(&_cs);
}

void GCode::_Init() {
	CSPtr CS(_cs);

	m[_T("GCODE_RUN")] = INI_PMAC.GetString(_T("COMMON_CMD"), _T("GCODE_RUN"));

	// 사용안함 ?
	// m[ _T("GCODE_LIST") ] = INI_PMAC.GetString( _T("COMMON_CMD") ,
	// _T("GCODE_LIST") );

	m[_T("GCODE_LINE_NO")] =
		INI_PMAC.GetString(_T("COMMON_CMD"), _T("GCODE_LINE_NO"));
	m[_T("OUT_VACUUM")] = INI_PMAC.GetString(_T("COMMON_CMD"), _T("OUT_VACUUM"));
	m[_T("IN_EMG_STOP")] =
		INI_PMAC.GetString(_T("COMMON_CMD"), _T("IN_EMG_STOP"));
	m[_T("IN_PRESSURE_ALARM")] =
		INI_PMAC.GetString(_T("COMMON_CMD"), _T("IN_PRESSURE_ALARM"));
	m[_T("PREPARATION_MOVE")] =
		INI_PMAC.GetString(_T("COMMON_CMD"), _T("PREPARATION_MOVE"));
	m[_T("WORK_MOVE")] = INI_PMAC.GetString(_T("COMMON_CMD"), _T("WORK_MOVE"));
	m[_T("LASER_CTRL")] = INI_PMAC.GetString(_T("COMMON_CMD"), _T("LASER_CTRL"));
	m[_T("LASER_PWR_CTRL")] =
		INI_PMAC.GetString(_T("COMMON_CMD"), _T("LASER_PWR_CTRL"));
}

BOOL GCode::InEMGStop() {
	CSPtr CS(_cs);

	CString Ret;
	if (!m_p->Read(m[_T("IN_EMG_STOP")], Ret))
		return FALSE;

	return _ttoi(Ret);
}

BOOL GCode::SetFeedrateSpeed(double PreMove, double RunWorkMove) {
	CSPtr CS(_cs);

	BOOL Ret1 = m_p->Write(m[_T("PREPARATION_MOVE")], PreMove);
	BOOL Ret2 = m_p->Write(m[_T("WORK_MOVE")], RunWorkMove);

	return Ret1 && Ret2;
}

// G-Code 명령어
/**
 * @brief G-Code를 컨트롤러 버퍼에 업로드
 * @param jobId  Portal에서 사용하는 Job ID (로그/추적 용도)
 * @param lines  G-Code 라인 벡터
 * @return 성공 여부
 */
BOOL GCode::UploadGCode(const std::string& jobId,
	const std::vector<std::string>& lines,
	std::function<void(int)> progressCallback) {
	// 스코프 락 또는 스마트 포인터 사용 가정
	CSPtr CS(_cs);


	m_p->CloseAllBuffers();


	// 멤버 변수 초기화
	m_vecBeforeGcodeLines.clear();
	m_vecCommentLines.clear();
	m_MaxGcodeLine = 1;

	// 처리된 명령어를 담을 임시 버퍼 (입력 벡터 lines를 수정할 수 없으므로)
	std::vector<CString> processedCommands;

	// 상태 플래그
	bool bHeaderInserted = false;
	bool bFooterInserted = false;
	bool bRunLineActive = false;

	// 헬퍼 람다: 대소문자 무시하고 prefix로 시작하는지 확인
	auto StartsWith = [](const CString& str, const CString& prefix) -> bool {
		if (str.GetLength() < prefix.GetLength())
			return false;
		return str.Left(prefix.GetLength()).CompareNoCase(prefix) == 0;
		};

	// 헬퍼 람다: 헤더 삽입
	auto InsertHeader = [&]() {
		processedCommands.push_back(_T("open prog 1"));
		//processedCommands.push_back(_T("ta(100)")); // 가속 시간
		//// processedCommands.push_back(_T("ta(50)")); // 가속 시간
		//processedCommands.push_back(_T("ts(14)")); // S-Curve 시간
		//// processedCommands.push_back(_T("f(10)")); // 피드레이트 (필요 시 주석
		//// 해제)


		// 5축 장비와 동일하게 설정 - 테스트
		processedCommands.push_back(_T("ta(0.1)")); // 가속 시간
		processedCommands.push_back(_T("ts(0)")); // S-Curve 시간


		// 추가해야함. dh.jung 20260702
		processedCommands.push_back(_T("linear"));
		processedCommands.push_back(_T("FRAX(X,Y,Z)"));
		};

	// 1. 입력 라인 순회 (멀티라인 청크 대응을 위해 \n 분리 처리)
	for (const auto& stdLineChunk : lines) {
		CString chunk(stdLineChunk.c_str());
		int curPos = 0;
		CString resToken = chunk.Tokenize(_T("\n"), curPos);

		while (resToken != _T("")) {
			CString trimmedLine = resToken.Trim();
			if (trimmedLine.IsEmpty()) {
				resToken = chunk.Tokenize(_T("\n"), curPos);
				continue;
			}

			// 원본 백업 저장
			m_vecBeforeGcodeLines.push_back(trimmedLine);

			// [Refactor] 헤더 자동 삽입 로직
			bool isComment = StartsWith(trimmedLine, _T("//"));
			bool isStartTag = (trimmedLine.CompareNoCase(_T("// START")) == 0);

			if (!bHeaderInserted) {
				if (isStartTag) {
					InsertHeader();
					bHeaderInserted = true;
				}
				else if (!isComment) {
					InsertHeader();
					bHeaderInserted = true;
				}
			}

			// 3. 주석 라인 처리 ("//")
			if (isComment) {
				m_vecCommentLines.push_back(trimmedLine);
				processedCommands.push_back(trimmedLine);

				if (trimmedLine.CompareNoCase(_T("// END")) == 0) {
					bRunLineActive = false;
					processedCommands.push_back(_T("close"));
					bFooterInserted = true;
				}
				resToken = chunk.Tokenize(_T("\n"), curPos);
				continue;
			}

			// 4. 일반 G-Code 및 실행 라인 처리
			if (!bRunLineActive && (StartsWith(trimmedLine, _T("G00")) ||
				StartsWith(trimmedLine, _T("G01")))) {
				bRunLineActive = true;
			}

			if (bRunLineActive) {
				// 실행 라인에는 개별 명령어마다 줄 번호(GLN) 부여
				CString formattedCommand;
				formattedCommand.Format(_T("%s GLN=%d"), trimmedLine, m_MaxGcodeLine++);
				processedCommands.push_back(formattedCommand);
			}
			else {
				processedCommands.push_back(trimmedLine);
			}

			resToken = chunk.Tokenize(_T("\n"), curPos);
		}
	}

	// [Refactor] 푸터 자동 삽입 (// END가 없었을 경우)
	if (!bFooterInserted) {
		// 헤더가 삽입되었다면(즉, 유효한 프로그램이라면) 닫기 명령 추가
		if (bHeaderInserted) {
			processedCommands.push_back(_T("close"));
		}
	}


	if (processedCommands.empty())
		return FALSE;

	// [FIX] 분할 기준 변경: 100라인 단위를 250 캐릭터(Byte) 단위로 제한
	const size_t MAX_CHARS_PER_CHUNK = 250;
	auto chunks = SplitChunksByCharCount(processedCommands, MAX_CHARS_PER_CHUNK);

	size_t totalChunks = chunks.size();
	size_t sentChunks = 0;

	for (auto& chunk : chunks)
	{
		if (!m_p->UploadChunk(chunk))
			return FALSE;

		sentChunks++;

		if (progressCallback)
		{
			int percent =
				(int)((sentChunks * 100) / totalChunks);

			progressCallback(percent);
		}
	}


	/*
	// 5. 결과 전송 (예시: m_p 객체를 통해 라인별 전송)
	size_t sentCount = 0;
	size_t totalCount = processedCommands.size();

	// 진행률 보고 주기 (너무 자주 보내지 않도록)
	size_t reportStep = totalCount / 100;
	if (reportStep < 1)
	  reportStep = 1;

	for (const auto &raw : processedCommands) {
	  // std::string bufLine = Trim(raw);
	  //       if (IsSkippableLine(bufLine)) {
	  //           continue;
	  //       }

	  // 필요시 대문자 변환 등 추가 전처리도 가능
	  // std::transform(bufLine.begin(), bufLine.end(), bufLine.begin(),
	  // ::toupper);

	  if (!m_p->Write(raw)) {
		// 실패하면 로그 남기고 전체 실패 처리
		// OutputDebugStringW(L"[MotionControllerGCode] AppendGCodeLine()
		// failed\n");
		return false;
	  }
	  ++sentCount;

	  // 진행률 콜백 호출
	  if (progressCallback &&
		  (sentCount % reportStep == 0 || sentCount == totalCount)) {
		int percent = (int)((sentCount * 100) / totalCount);
		if (percent > 100)
		  percent = 100;
		progressCallback(percent);
	  }
	}

	if (sentCount == 0) {
	  // OutputDebugStringW(L"[MotionControllerGCode] no valid gcode lines\n");
	  return false;
	}
	*/

	/*
	// 위 5번 항목 대체 (5~6)
	// 5. 한번에 전송 (고속전송)
	if (!m_p->UploadProgram(processedCommands, 1))
	{
		return FALSE;
	}

	// 6. 진행률 100%
	if (progressCallback)
	{
		progressCallback(100);
	}
	*/




	// 작업이 정상적으로 완료되었다면 TRUE 반환
	return TRUE;
}

/**
 * @brief Gcode_Run 명령 전송
 * @details
 *  - mode = 1 : G-Code 실행 시작
 *  - mode = 2 : G-Code 실행 취소
 *  - mode = 3 : G-Code Pause
 *  - mode = 4 : G-Code Resume
 * @param mode Gcode_Run 모드 값
 * @return 성공 여부
 */
bool GCode::CommandGCodeRun(int mode, int ttlTime) {
	CSPtr CS(_cs);

	BOOL Ret1 = FALSE;

	if (mode == 1) { // G-Code 실행 시작 시
		m_p->Write(m[_T("GCODE_LINE_NO")], 0.0);

		// [NEW] Laser Control for Object (GCode) 가공 시작 전
		CString selAddr = INI_PMAC.GetString(_T("COMMON_CMD"), _T("LASER_CTRL_SELECTOR"));
		if (!selAddr.IsEmpty()) m_p->Write(selAddr, _T("2"));

		CString ttlAddr = INI_PMAC.GetString(_T("COMMON_CMD"), _T("TTL_OUTPUT_TIME"));
		if (!ttlAddr.IsEmpty()) {
			CString strTtl; strTtl.Format(_T("%d"), ttlTime);
			m_p->Write(ttlAddr, strTtl);
		}
	}
	else if (mode == 2 || mode == 0) {
		// G-Code 실행 취소/정지 시 Scanner 모드로 복귀
		SetLaserSelector(1);
	}

	Ret1 = m_p->Write(m[_T("GCODE_RUN")], mode);

	return Ret1;
}

void GCode::SetLaserSelector(int val) {
	CSPtr CS(_cs);
	CString selAddr = INI_PMAC.GetString(_T("COMMON_CMD"), _T("LASER_CTRL_SELECTOR"));
	if (!selAddr.IsEmpty()) {
		CString strVal; strVal.Format(_T("%d"), val);
		m_p->Write(selAddr, strVal);
	}
}

/**
 * @brief GLN(현재 실행 중인 G-Code 라인 번호) 조회
 * @param outLine 현재 라인 번호 반환
 * @return 성공 여부
 */
bool GCode::QueryGCodeLine(int& outLine) {
	CSPtr CS(_cs);
	CString Ret;
	if (!m_p->Read(m[_T("GCODE_LINE_NO")], Ret))
		return false;

	int eqPos = Ret.Find(_T('='));
	if (eqPos != -1) {
		Ret = Ret.Mid(eqPos + 1);
	}

	outLine = _ttoi(Ret);
	return true;
}

/**
 * @brief GCodeBuffList에 인덱스가 존재하는지 확인
 */
bool GCode::GCodeBuffListCheck(const int nIndex) {
	CSPtr CS(_cs);

	CString Ret;

	if (!m_p->Read(m[_T("GCODE_LINE_NO")], Ret))
		return FALSE;

	int eqPos = Ret.Find(_T('='));
	if (eqPos != -1) {
		Ret = Ret.Mid(eqPos + 1);
	}

	return _ttoi(Ret) == nIndex;
}