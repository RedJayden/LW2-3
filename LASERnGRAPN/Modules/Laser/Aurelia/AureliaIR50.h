/**
 * @file AureliaIR50.h
 * @brief Aurelia IR-50 펨토초 레이저 제어를 위한 Modbus RTU 프로토콜 헤더
 * @author Antigravity
 * @date 2026-04-27
 */

#include "pch.h"
#pragma once

#include <windows.h>
#include <string>
#include <vector>
#include <memory>
#include "../../Shared/Util/Serial.h"

/**
 * @brief Aurelia 레이저 Modbus 프로토콜 인터페이스
 */
class IAureliaIR50Protocol {
public:
    virtual ~IAureliaIR50Protocol() = default;

    /** @brief 단일 레지스터 읽기 패킷 생성 (FC 03) */
    virtual std::vector<BYTE> MakeReadRequest(WORD address, WORD count = 1) const = 0;

    /** @brief 단일 레지스터 쓰기 패킷 생성 (FC 06) */
    virtual std::vector<BYTE> MakeWriteRequest(WORD address, WORD value) const = 0;

    /** @brief 응답 패킷 유효성 검사 및 데이터 추출 */
    virtual bool ParseResponse(const std::vector<BYTE>& response, WORD& outValue) const = 0;
};

/**
 * @brief Aurelia 레이저 Modbus RTU 프로토콜 구현체
 */
class AureliaIR50ModbusProtocol final : public IAureliaIR50Protocol {
public:
    std::vector<BYTE> MakeReadRequest(WORD address, WORD count = 1) const override;
    std::vector<BYTE> MakeWriteRequest(WORD address, WORD value) const override;
    bool ParseResponse(const std::vector<BYTE>& response, WORD& outValue) const override;

private:
    static const BYTE SLAVE_ADDR = 0x01;
    static const BYTE FUNC_READ = 0x03;
    static const BYTE FUNC_WRITE = 0x06;

    /** @brief Modbus CRC-16 계산 */
    WORD CalculateCRC(const BYTE* data, size_t len) const;
};

/**
 * @brief Aurelia IR-50 레이저 제어 메인 클래스
 * @details LCP1250H의 구조를 따르며 m_Serial을 사용하여 통신을 수행함
 */
class AureliaIR50 {
public:
    explicit AureliaIR50(std::unique_ptr<IAureliaIR50Protocol> protocol);
    ~AureliaIR50();

    // Copy/Assignment 금지
    AureliaIR50(const AureliaIR50&) = delete;
    AureliaIR50& operator=(const AureliaIR50&) = delete;

    /**
     * @brief 장치 연결
     * @param port COM 포트 번호
     * @param baudrate 통신 속도
     * @param error 에러 발생 시 에러 코드 저장
     * @return 성공 여부
     */
    BOOL Open(int port, int baudrate, DWORD& error);
    /** @brief 포트 연결 상태 확인 */
    BOOL IsOpen();
    /** @brief 포트 닫기 */
    void Close();

    // --- 제어 명령 ---
    void SetPower(bool on);
    void SetShutter(bool open);
    void SetFrequency(int khz);
    void SetBurst(int count);
    void SetAmpPower(float percent);
    void SetPulseWidth(int fs);
    void SetControlMode(int mode); // 0: Internal, 1: External

    // --- 상태 쿼리 ---
    int GetPowerStatus();
    int GetOperatingStatus();
    int GetShutterStatus();
    float GetTemperature();
    float GetHumidity();
    WORD GetAlarmInfo();
    int GetRunningHours();
    int GetRunningMinutes();
    WORD GetErrorCode();
    float GetErrorData();

    // --- 파라미터 읽기 ---
    int GetMode();
    int GetFrequency();
    int GetBurstCount();
    float GetAmpPower();
    int GetPulseWidth();

private:
    std::unique_ptr<IAureliaIR50Protocol> m_protocol;
    CRITICAL_SECTION _cs;
    CSerial m_Serial;

    static const int BAUD_RATE = 19200;

    /** @brief 데이터 전송 및 수신 */
    bool Query(WORD address, WORD value, bool isWrite, WORD& outValue);
};
