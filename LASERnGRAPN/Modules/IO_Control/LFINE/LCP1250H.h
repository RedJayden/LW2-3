/**
 * @file LCP1250H.h
 * @brief C++11 이상 모든 버전에서 호환 가능한 LCP1250H 제어 헤더
 */

#pragma once

#include <windows.h>
#include <string>
#include <memory>

 // 제어 문자 정의
static const char STX = 0x02;
static const char ETX = 0x03;

class ILCP1250HProtocol {
public:
    virtual ~ILCP1250HProtocol() = default;
    virtual std::string MakeOn(int channel) const = 0;
    virtual std::string MakeOff(int channel) const = 0;
    virtual std::string MakeBrightness(int channel, int level) const = 0;
    virtual std::string MakeReadBrightness(int channel) const = 0;
};

class LCP1250HAsciiProtocol final : public ILCP1250HProtocol {
public:
    std::string MakeOn(int channel) const override;
    std::string MakeOff(int channel) const override;
    std::string MakeBrightness(int channel, int level) const override;
    std::string MakeReadBrightness(int channel) const override;

private:
    /** @brief STX/ETX 캡슐화 헬퍼 (std::string 사용) */
    std::string Enclose(const std::string& payload) const {
        std::string packet;
        packet.reserve(payload.size() + 2);
        packet += STX;
        packet += payload;
        packet += ETX;
        return packet;
    }
};

class LCP1250H {
public:
    explicit LCP1250H(std::unique_ptr<ILCP1250HProtocol> protocol);
    ~LCP1250H();

    LCP1250H(const LCP1250H&) = delete;
    LCP1250H& operator=(const LCP1250H&) = delete;

    BOOL Open(int COM, DWORD& Error);
    BOOL IsOpen();
    void Close();

    void TurnOn(int channel);
    void TurnOff(int channel);
    void SetBrightness(int channel, int level);
    int  GetBrightness(int channel);

private:
    std::unique_ptr<ILCP1250HProtocol> m_protocol;

    CRITICAL_SECTION _cs;
    CSerial m_Serial;

    static const int MAX_CHANNELS = 6;
    static const int BAUD_RATE = 57600;

    bool IsValidChannel(int channel) const {
        return (channel >= 1 && channel <= MAX_CHANNELS);
    }

    void Transmit(const std::string& command);
};