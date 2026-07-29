/**
 * @file AureliaIR50.cpp
 * @brief Aurelia IR-50 레이저 제어 구현부
 * @author Antigravity
 */

#include "pch.h"
#include "AureliaIR50.h"
#include <iostream>
#include <iomanip>

// --- AureliaIR50ModbusProtocol 구현 ---

std::vector<BYTE> AureliaIR50ModbusProtocol::MakeReadRequest(WORD address, WORD count) const {
    std::vector<BYTE> packet;
    packet.push_back(SLAVE_ADDR);
    packet.push_back(FUNC_READ);
    packet.push_back(static_cast<BYTE>(address >> 8));
    packet.push_back(static_cast<BYTE>(address & 0xFF));
    packet.push_back(static_cast<BYTE>(count >> 8));
    packet.push_back(static_cast<BYTE>(count & 0xFF));

    WORD crc = CalculateCRC(packet.data(), packet.size());
    packet.push_back(static_cast<BYTE>(crc >> 8)); // Manual swaps them: MSB first
    packet.push_back(static_cast<BYTE>(crc & 0xFF)); // LSB second
    return packet;
}

std::vector<BYTE> AureliaIR50ModbusProtocol::MakeWriteRequest(WORD address, WORD value) const {
    std::vector<BYTE> packet;
    packet.push_back(SLAVE_ADDR);
    packet.push_back(FUNC_WRITE);
    packet.push_back(static_cast<BYTE>(address >> 8));
    packet.push_back(static_cast<BYTE>(address & 0xFF));
    packet.push_back(static_cast<BYTE>(value >> 8));
    packet.push_back(static_cast<BYTE>(value & 0xFF));

    WORD crc = CalculateCRC(packet.data(), packet.size());
    packet.push_back(static_cast<BYTE>(crc >> 8));
    packet.push_back(static_cast<BYTE>(crc & 0xFF));
    return packet;
}

bool AureliaIR50ModbusProtocol::ParseResponse(const std::vector<BYTE>& response, WORD& outValue) const {
    if (response.size() < 5) return false;

    // Check Slave Addr and Function Code
    if (response[0] != SLAVE_ADDR) return false;

    // CRC Check (last 2 bytes)
    WORD receivedCRC = (static_cast<WORD>(response[response.size() - 2]) << 8) | response[response.size() - 1];
    WORD calculatedCRC = CalculateCRC(response.data(), response.size() - 2);
    if (receivedCRC != calculatedCRC) return false;

    if (response[1] == FUNC_READ) {
        // [Addr][FC][ByteCount][DataH][DataL]...[CRCH][CRCL]
        if (response.size() < 7) return false;
        outValue = (static_cast<WORD>(response[3]) << 8) | response[4];
        return true;
    } else if (response[1] == FUNC_WRITE) {
        // [Addr][FC][RegAddrH][RegAddrL][ValH][ValL][CRCH][CRCL]
        if (response.size() < 8) return false;
        outValue = (static_cast<WORD>(response[4]) << 8) | response[5];
        return true;
    }

    return false;
}

WORD AureliaIR50ModbusProtocol::CalculateCRC(const BYTE* data, size_t len) const {
    unsigned short crc = 0xFFFF;
    for (size_t j = 0; j < len; j++) {
        crc = crc ^ data[j];
        for (int i = 0; i < 8; i++) {
            if ((crc & 0x0001) > 0) {
                crc = crc >> 1;
                crc = crc ^ 0xA001;
            } else {
                crc = crc >> 1;
            }
        }
    }
    // Swap bytes as per manual page 33
    unsigned short a = (crc << 8) & 0xFF00;
    unsigned short b = (crc >> 8) & 0x00FF;
    return (a | b);
}

// --- AureliaIR50 메인 구현 ---

AureliaIR50::AureliaIR50(std::unique_ptr<IAureliaIR50Protocol> protocol)
    : m_protocol(std::move(protocol)) {
    InitializeCriticalSectionAndSpinCount(&_cs, 2000);
}

AureliaIR50::~AureliaIR50() {
    Close();
    DeleteCriticalSection(&_cs);
}

BOOL AureliaIR50::Open(int port, int baudrate, DWORD& error) {
    // 8N1 설정 (8 데이터 비트, 1 스톱 비트, No 패리티)
    // CSerial::OpenPort(port, baudrate, dataBits, stopBits, parity, error)
    // NOPARITY=0, ONESTOPBIT=0 (Windows SDK defines)
    if (m_Serial.OpenPort(port, static_cast<DWORD>(baudrate), 8, 0, 0, error)) {
        return TRUE;
    }
    return FALSE;
}

BOOL AureliaIR50::IsOpen() {
    return m_Serial.IsConnected();
}

void AureliaIR50::Close() {
    EnterCriticalSection(&_cs);
    m_Serial.ClosePort();
    LeaveCriticalSection(&_cs);
}

void AureliaIR50::SetPower(bool on) {
    WORD val = 0;
    Query(0x0FA8, on ? 1 : 0, true, val);
}

void AureliaIR50::SetShutter(bool open) {
    WORD val = 0;
    Query(0x0FA9, open ? 1 : 0, true, val);
}

void AureliaIR50::SetFrequency(int khz) {
    WORD val = 0;
    Query(0x0FB5, static_cast<WORD>(khz), true, val);
}

void AureliaIR50::SetBurst(int count) {
    WORD val = 0;
    Query(0x0FB6, static_cast<WORD>(count), true, val);
}

void AureliaIR50::SetAmpPower(float percent) {
    WORD val = static_cast<WORD>(percent * 100.0f);
    Query(0x0FB7, val, true, val);
}

void AureliaIR50::SetPulseWidth(int fs) {
    WORD val = 0;
    Query(0x0FAD, static_cast<WORD>(fs), true, val);
}

void AureliaIR50::SetControlMode(int mode) {
    WORD val = 0;
    Query(0x0FB4, static_cast<WORD>(mode), true, val);
}

int AureliaIR50::GetPowerStatus() {
    WORD val = 0;
    if (Query(0x0FAB, 0, false, val)) return val;
    return -1;
}

int AureliaIR50::GetOperatingStatus() {
    WORD val = 0;
    if (Query(0x0FAE, 0, false, val)) return val;
    return -1;
}

int AureliaIR50::GetShutterStatus() {
    WORD val = 0;
    if (Query(0x0FA9, 0, false, val)) return val;
    return -1;
}

float AureliaIR50::GetTemperature() {
    WORD val = 0;
    if (Query(0x0FA2, 0, false, val)) return val / 100.0f;
    return -1.0f;
}

float AureliaIR50::GetHumidity() {
    WORD val = 0;
    if (Query(0x0FA5, 0, false, val)) return val / 100.0f;
    return -1.0f;
}

WORD AureliaIR50::GetAlarmInfo() {
    WORD val = 0;
    if (Query(0x0FAF, 0, false, val)) return val;
    return 0;
}

int AureliaIR50::GetRunningHours() {
    WORD val = 0;
    if (Query(0x0FB2, 0, false, val)) return static_cast<int>(val);
    return 0;
}

int AureliaIR50::GetRunningMinutes() {
    WORD val = 0;
    if (Query(0x0FB3, 0, false, val)) return static_cast<int>(val);
    return 0;
}

WORD AureliaIR50::GetErrorCode() {
    WORD val = 0;
    if (Query(0x0FB0, 0, false, val)) return val;
    return 0;
}

float AureliaIR50::GetErrorData() {
    WORD val = 0;
    if (Query(0x0FB1, 0, false, val)) return static_cast<float>(val);
    return 0.0f;
}

int AureliaIR50::GetMode() {
    WORD val = 0;
    if (Query(0x0FB4, 0, false, val)) return static_cast<int>(val);
    return -1;
}

int AureliaIR50::GetFrequency() {
    WORD val = 0;
    if (Query(0x0FB5, 0, false, val)) return static_cast<int>(val);
    return 0;
}

int AureliaIR50::GetBurstCount() {
    WORD val = 0;
    if (Query(0x0FB6, 0, false, val)) return static_cast<int>(val);
    return 0;
}

float AureliaIR50::GetAmpPower() {
    WORD val = 0;
    if (Query(0x0FB7, 0, false, val)) return val / 100.0f;
    return 0.0f;
}

int AureliaIR50::GetPulseWidth() {
    WORD val = 0;
    if (Query(0x0FAD, 0, false, val)) return static_cast<int>(val);
    return 0;
}

bool AureliaIR50::Query(WORD address, WORD value, bool isWrite, WORD& outValue) {
    if (!m_Serial.IsConnected()) return false;

    EnterCriticalSection(&_cs);
    std::vector<BYTE> req = isWrite ? m_protocol->MakeWriteRequest(address, value)
                                    : m_protocol->MakeReadRequest(address, 1);

    BYTE resBuffer[256] = {0};
    DWORD readSize = m_Serial.SendAndRead(req.data(), static_cast<DWORD>(req.size()), resBuffer, 256, 300);

    bool success = false;
    if (readSize > 0) {
        std::vector<BYTE> res(resBuffer, resBuffer + readSize);
        success = m_protocol->ParseResponse(res, outValue);
    }

    LeaveCriticalSection(&_cs);

    // 매뉴얼상 명령 간 100ms 대기 필요
    Sleep(100);

    return success;
}
