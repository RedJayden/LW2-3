/**
 * @file LCP1250H.cpp
 * @brief 하위 호환성을 확보한 구현부
 */

#include "pch.h"
#include "LCP1250H.h"
#include <algorithm>
#include <cstdio>

// --- LCP1250HAsciiProtocol 구현 ---

std::string LCP1250HAsciiProtocol::MakeOn(int channel) const {
  return Enclose(std::to_string(channel - 1) + "o");
}

std::string LCP1250HAsciiProtocol::MakeOff(int channel) const {
  return Enclose(std::to_string(channel - 1) + "f");
}

std::string LCP1250HAsciiProtocol::MakeBrightness(int channel,
                                                  int level) const {
  // 0~1023 제한
  int val = (level < 0) ? 0 : (level > 1023 ? 1023 : level);

  char buf[16];
  // %04d: 4자리 숫자로 채우고 빈자리는 0으로 채움 (예: 0512)
  // Channel is 0-based in wire protocol
  sprintf_s(buf, sizeof(buf), "%dw%04d", channel - 1, val);

  return Enclose(buf);
}

std::string LCP1250HAsciiProtocol::MakeReadBrightness(int channel) const {
  return Enclose(std::to_string(channel - 1) + "r");
}

// --- LCP1250H 메인 구현 ---

LCP1250H::LCP1250H(std::unique_ptr<ILCP1250HProtocol> protocol)
    : m_protocol(std::move(protocol)) {
  InitializeCriticalSectionAndSpinCount(&_cs, 2000);
}

LCP1250H::~LCP1250H() {
  Close();
  DeleteCriticalSection(&_cs);
}

BOOL LCP1250H::Open(int COM, DWORD &Error) {
  CSPtr CS(_cs);
  BOOL bRet = m_Serial.OpenPort(COM, BAUD_RATE, 8, ONESTOPBIT, NOPARITY, Error);

  return bRet;
}

BOOL LCP1250H::IsOpen() {
  if (!m_Serial.IsConnected())
    return FALSE;

  CSPtr CS(_cs);

  return m_Serial.IsConnected();
}

void LCP1250H::Close() {
  CSPtr CS(_cs);

  m_Serial.ClosePort();
}

void LCP1250H::TurnOn(int channel) {
  CSPtr CS(_cs);

  if (IsValidChannel(channel))
    Transmit(m_protocol->MakeOn(channel));
}

void LCP1250H::TurnOff(int channel) {
  CSPtr CS(_cs);

  if (IsValidChannel(channel))
    Transmit(m_protocol->MakeOff(channel));
}

void LCP1250H::SetBrightness(int channel, int level) {
  CSPtr CS(_cs);

  if (IsValidChannel(channel))
    Transmit(m_protocol->MakeBrightness(channel, level));
}

int LCP1250H::GetBrightness(int channel) {
  CSPtr CS(_cs);

  if (!IsValidChannel(channel))
    return -1;

  std::string cmd = m_protocol->MakeReadBrightness(channel);
  BYTE resBuffer[MAX_BUFFER_SIZE] = {
      0,
  };

  DWORD readSize = m_Serial.SendAndRead(
      reinterpret_cast<const BYTE *>(cmd.c_str()),
      static_cast<DWORD>(cmd.size()), resBuffer, MAX_BUFFER_SIZE, 250);

  if (readSize > 0) {
    std::string resStr(reinterpret_cast<char *>(resBuffer), readSize);

    size_t start = resStr.find(STX);
    size_t end = resStr.find(ETX);

    if (start != std::string::npos && end != std::string::npos && end > start) {
      try {
        std::string payload = resStr.substr(start + 1, end - start - 1);
        // 아스키 숫자만 추출하기 위해 처리 (채널 번호 등이 포함된 경우 대비)
        // 만약 응답이 "4w0512" 형태라면 숫자 부분만 substract 해야 함
        return std::stoi(payload);
      } catch (...) {
        return -1;
      }
    }
  }
  return -1;
}

void LCP1250H::Transmit(const std::string &command) {
  if (!m_Serial.IsConnected())
    return;

  CSPtr CS(_cs);

  m_Serial.Send(reinterpret_cast<const BYTE *>(command.c_str()),
                static_cast<DWORD>(command.size()));
}