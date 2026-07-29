#pragma once

#define Alert(X)         	        ::MessageBox( AfxGetMainWnd()->GetSafeHwnd() , X , _T("") , MB_OK | MB_TOPMOST )
#define YesNo(X)                    ::MessageBox( AfxGetMainWnd()->GetSafeHwnd() , X , _T("") , MB_OKCANCEL | MB_TOPMOST )

#define RETURN(FUNC)				do { FUNC; return;       } while(0)
#define RETURN_V(VALUE)             do { return VALUE;       } while(0)
#define RETURN_F_V(FUNC,VALUE)		do { FUNC; return VALUE; } while(0)
#define RETURN_MSG(MESSAGE)		    RETURN( Alert( MESSAGE ) )
#define RETURN_MSG_V(MESSAGE,VALUE) RETURN_F_V( Alert( MESSAGE ) , VALUE )

#define CONTINUE(FUNC)				{ FUNC; continue;        }
#define CONTINUE_SLEEP(TICK)		{ Sleep(TICK); continue; }

#define BREAK(FUNC)				    { FUNC; break;	         }

#define IS_ODD(X)				    ((X)&1)
#define IS_EVEN(X)				    (!IS_ODD((X)))

#include <strsafe.h>
#include "FontManager.h"
#include "MinidumpHelp.h"
#include "SyncContainer.h"
#include "SyncObject.h"
#include "Invoke.h"
#include "JobEvent.h"
#include "HighOrderContainer.h"
#include "StringUtil.h"
#include "IniFile.h"
#include "UIUtil.h"
#include "MemoryUtil.h"
#include "ProcessUtil.h"
#include "TimeUtil.h"
#include "FileSystemUtil.h"
#include "FolderUtil.h"
#include "Log.h"
#include "Thread.h"
#include "MFCCheckButton.h"
#include "Serial.h"
#include "Color.h"
#include "ColorStatic.h"
#include "ValueEncode.h"