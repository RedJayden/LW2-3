#include "pch.h"

namespace MemUtil
{
	BytePtr Copy(void* pSrc, int Size, int DestAddSize)
	{
		int DestSize = Size + DestAddSize;

		BytePtr Res(new BYTE[DestSize]);
		memcpy_s(Res.Get(), DestSize, pSrc, Size);

		return std::move(Res);
	}
};