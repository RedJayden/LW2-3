#include "pch.h"
#include "NetworkUtil.h"
#include <WS2tcpip.h>
#include <icmpapi.h>
#include "MemoryUtil.h"

#include <WinSock2.h>
#pragma comment( lib , "WS2_32.lib" )

#include <iphlpapi.h>
#pragma comment(lib, "iphlpapi.lib")

namespace NetUtil
{
	namespace
	{
		WSADATA _data = { 0 , };
	};

	BOOL SocketInit()
	{
		return WSAStartup(MAKEWORD(2, 2), &_data);
	}

	void SocketRelease()
	{
		WSACleanup();
	}

	HighOrderVector<CStringA> GetIPAddress(int* ErrorCode)
	{
		char HostName[128] = { 0 , };
		gethostname(HostName, _countof(HostName));

		struct addrinfo* info = NULL;

		int Ret = getaddrinfo(HostName, NULL, NULL, &info);
		if (Ret != 0)
		{
			if (ErrorCode) *ErrorCode = Ret;
			return HighOrderVector<CStringA>();
		}

		HighOrderVector<CStringA> AddressInfo;
		for (addrinfo* p = info; p != NULL; p = p->ai_next)
		{
			char IPAddress[INET_ADDRSTRLEN] = { 0 , };

			sockaddr_in* pSocketAddress = (sockaddr_in*)p->ai_addr;
			inet_ntop(p->ai_family, &pSocketAddress->sin_addr, IPAddress, _countof(IPAddress));

			AddressInfo.push_back(IPAddress);
		}

		if (info) freeaddrinfo(info);

		return AddressInfo;
	}

	BOOL Ping(const CStringA& IP)
	{
		HANDLE hICMP(IcmpCreateFile());
		if (hICMP == INVALID_HANDLE_VALUE) return FALSE;

		SCOPE_OUT([&hICMP]() { IcmpCloseHandle(hICMP); });

		in_addr ipAddr = {};
		if (inet_pton(AF_INET, IP, &ipAddr) != 1) return FALSE;

		char  SendData[] = "PingTest";
		DWORD ReplySize = sizeof(ICMP_ECHO_REPLY) + _countof(SendData);
		void* ReplyBuffer = malloc(ReplySize);

		SCOPE_OUT([&ReplyBuffer]() { FREE_MEMORY(ReplyBuffer); });

		DWORD dwRetVal = IcmpSendEcho(hICMP, ipAddr.S_un.S_addr,
			SendData, _countof(SendData),
			nullptr,
			ReplyBuffer, ReplySize,
			1000);
		return dwRetVal != 0;
	}
};