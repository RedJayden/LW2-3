#pragma once

#include <vector>
#include <functional>

class PMAC;
class GCode
{
public:

    GCode( PMAC* pPMAC );
    ~GCode();

    // 이전 찾은 위치 저장
    int m_nLastMatchedIndex = -1;
    int m_MaxGcodeLine = 1;

    std::vector<CString> m_vecBeforeGcodeLines;  // 라인 적용 전
    std::vector<CString> m_vecCommentLines;      // 주석 라인 저장용

public:

    BOOL InEMGStop();

	// GCode Feedrate 설정
    BOOL SetFeedrateSpeed( double PreMove , double RunWorkMove);

	// G-Code 명령어
    /**
    * @brief G-Code를 컨트롤러 버퍼에 업로드
    * @param jobId  Portal에서 사용하는 Job ID (로그/추적 용도)
    * @param lines  G-Code 라인 벡터
    * @return 성공 여부
    */
	// #include <functional>  <-- Ensure this is included at top if not present (added in separate step or implicitly)
	BOOL UploadGCode(const std::string& jobId, const std::vector<std::string>& lines, std::function<void(int)> progressCallback = nullptr);
    /**
    * @brief Gcode_Run 명령 전송
    * @details
    *  - mode = 1 : G-Code 실행 시작
    *  - mode = 2 : G-Code 실행 취소
    * @param mode Gcode_Run 모드 값
    * @param ttlTime TTL 설정시간 (us)
    * @return 성공 여부
    */
    bool CommandGCodeRun(int mode, int ttlTime = 20);

    /**
    * @brief LaserCtrlSelector 값을 PMAC에 직접 Write
    */
    void SetLaserSelector(int val);

    /**
     * @brief GLN(현재 실행 중인 G-Code 라인 번호) 조회
     * @param outLine 현재 라인 번호 반환
     * @return 성공 여부
     */
    bool QueryGCodeLine(int& outLine);

    /**
	* @brief GCodeBuffList에 인덱스가 존재하는지 확인
    */
    bool GCodeBuffListCheck(const int nIndex);


    /**
      @brief  GCode 문자열을 각 덩어리의 총 문자 수(Char Count) 기준으로 분리
      @param  src       기존 GCode 라인 벡터
      @param  maxChars  한 Chunk당 최대 허용 문자 수 (기본 250자)
      @retval 분리된 Chunk들의 벡터
    */
    static std::vector<std::vector<CString>>
        SplitChunksByCharCount(const std::vector<CString>& src, size_t maxChars = 250)
    {
        std::vector<std::vector<CString>> chunks;
        std::vector<CString> currentChunk;
        size_t currentLength = 0;

        for (const auto& line : src)
        {
            // 라인 끝에 개행문자가 붙는 것을 고려하여 +1 (+2 for \r\n if needed, but usually \n)
            size_t lineLen = line.GetLength() + 1;

            // 만약 한 라인 자체가 250자를 넘는다면? (희귀케이스지만 대비)
            if (lineLen > maxChars && currentChunk.empty()) {
                currentChunk.push_back(line);
                chunks.push_back(currentChunk);
                currentChunk.clear();
                currentLength = 0;
                continue;
            }

            if (currentLength + lineLen > maxChars && !currentChunk.empty())
            {
                chunks.push_back(currentChunk);
                currentChunk.clear();
                currentLength = 0;
            }

            currentChunk.push_back(line);
            currentLength += lineLen;
        }

        if (!currentChunk.empty())
        {
            chunks.push_back(currentChunk);
        }

        return chunks;
    }

    // Legacy support (calls the new length-based chunking if chunkSize is small enough?
    // No, better to keep it or just replace calls in .cpp)
    static std::vector<std::vector<CString>>
        SplitChunks(const std::vector<CString>& src, size_t chunkSize)
    {
        // 100라인 단위면 매우 길어질 수 있으므로, 기본적으로 CharCount 방식을 권장하게 함.
        return SplitChunksByCharCount(src, 250);
    }

private:

    void _Init();

private:

    mutable CRITICAL_SECTION _cs;

    SyncMap< std::map<CString,CString> , CString , CString > m;

    PMAC* m_p = NULL;
};
