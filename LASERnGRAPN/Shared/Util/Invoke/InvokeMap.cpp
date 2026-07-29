#include "pch.h"
#include "InvokeMap.h"
#include "Invoke.h"

namespace InvokeMap {
	namespace Private {
		BOOL _is_closing = FALSE;

		SyncMap<std::map<int, Invoke::Entry*>, int, Invoke::Entry*> _key_map;
		SyncMap<std::map<DWORD_PTR, Invoke::Entry*>, DWORD_PTR, Invoke::Entry*>
			_no_key_map;

		CRITICAL_SECTION _cs;
	}; // namespace Private

	BOOL Init() {
		return InitializeCriticalSectionAndSpinCount(&Private::_cs, 3000);
	}

	void Release(DWORD64 WaitTick) {
		Private::_is_closing = TRUE;

		DWORD64 Start = GetTickCount64();
		while (GetTickCount64() - Start < WaitTick) {
			int EntryCount = InvokeMap::GetCountEntry();
			if (EntryCount <= 0)
				break;

			Sleep(1);
		}

		DeleteCriticalSection(&Private::_cs);
	}

	BOOL IsRelease() { return Private::_is_closing; }

	Invoke::Entry* GetEntry(Invoke::AccKey Key) {
		CSPtr Obj(Private::_cs);

		if (InvokeMap::IsRelease())
			return NULL;

		if (Key == Invoke::NO_KEY || !Private::_key_map.Has(Key))
			return NULL;

		Invoke::Entry* pEntry = Private::_key_map.Get(Key);

		pEntry->IncreaseCnt();

		return pEntry;
	}

	void SetEntry(Invoke::AccKey Key, Invoke::Entry* pEntry) {
		CSPtr Obj(Private::_cs);

		if (InvokeMap::IsRelease())
			return;

		pEntry->IncreaseCnt();

		if (Key == Invoke::NO_KEY)
			RETURN(Private::_no_key_map.Set((DWORD_PTR)pEntry, pEntry));

		Private::_key_map.Set(Key, pEntry);
	}

	int GetCountEntry() {
		return Private::_key_map.Count() + Private::_no_key_map.Count();
	}

	void CloseEntry(Invoke::AccKey Key) {
		CSPtr Obj(Private::_cs);

		if (Key == Invoke::NO_KEY || !Private::_key_map.Has(Key))
			return;

		Invoke::Entry* pEntry = Private::_key_map.Get(Key);
		if (pEntry->DecreaseCnt() > 0)
			return;

		Private::_key_map.Delete(Key);
		delete pEntry;
	}

	void CloseEntry(const Invoke::Entry* pEntry) {
		CSPtr Obj(Private::_cs);

		if (pEntry->GetKey() != Invoke::NO_KEY)
			RETURN(CloseEntry(pEntry->GetKey()));

		Invoke::Entry* pObj =
			(Invoke::Entry*)Private::_no_key_map.Get((DWORD_PTR)pEntry);
		Private::_no_key_map.Delete((DWORD_PTR)pEntry);
		delete pObj;
	}

	BOOL WaitForEntry(Invoke::AccKey Key, BOOL FinishReq, DWORD WaitTick) {
		CSPtr Obj(Private::_cs);

		Invoke::Entry* p = InvokeMap::GetEntry(Key);
		if (!p)
			return FALSE;

		if (FinishReq)
			p->ReqFinish();

		InvokeMap::CloseEntry(p);

		return WaitForSingleObject(p->GetFinishHandle(), WaitTick) == WAIT_OBJECT_0;
	}
}; // namespace InvokeMap
