#pragma once

class CIniFile : public CObject
{
public:
	CIniFile(LPCTSTR lpIniFileName, UINT iMaxStringLength = 1024*64);
	virtual ~CIniFile();

// Attributes
protected:
	CString		m_strFileName;	// path to the INI file
	const UINT	m_MAXSTRLEN;	// max length of a string (excluding the key name) that can be wtritten/read to/from the INI file by this instance

// Implementation	
public:
	CString	GetIniFileName();
	void	SetIniFileName(LPCTSTR lpIniFileName);
	BOOL	GetStatus(CFileStatus& rStatus);

	BOOL	GetString(LPCTSTR lpSection, LPCTSTR lpKey, CString& strRet, LPCTSTR strDefault);
	CString GetString(LPCTSTR lpSection, LPCTSTR lpKey);
	INT		GetInt(LPCTSTR lpSection, LPCTSTR lpKey, INT iDefaultValue = 0);
	FLOAT	GetFloat(LPCTSTR lpSection, LPCTSTR lpKey, FLOAT fDefaultValue = 0.0f );
	FLOAT	GetFloat(LPCTSTR lpSection, LPCTSTR lpKey, FLOAT fDefaultValue, INT iPrecision);
	DOUBLE  GetDouble(LPCTSTR lpSection, LPCTSTR lpKey, DOUBLE fDefaultValue = 0.0 );
	DOUBLE  GetDouble(LPCTSTR lpSection, LPCTSTR lpKey, DOUBLE fDefaultValue, INT iPrecision);
	BOOL	GetStruct(LPCTSTR lpSection, LPCTSTR lpKey, LPVOID lpRetStruct, UINT iSizeStruct);
	void	GetSectionNames(CStringList& lstSectionNames);

	BOOL	WriteSection(LPCTSTR lpSection, LPCTSTR lpData);
	BOOL	WriteString(LPCTSTR lpSection, LPCTSTR lpKey, LPCTSTR lpString);
	BOOL	WriteNumber(LPCTSTR lpSection, LPCTSTR lpKey, INT iValue);
	BOOL	WriteNumber(LPCTSTR lpSection, LPCTSTR lpKey, FLOAT fValue);
	BOOL    WriteNumber(LPCTSTR lpSection, LPCTSTR lpKey, DOUBLE fValue);
	BOOL	WriteStruct(LPCTSTR lpSection, LPCTSTR lpKey, LPVOID lpStruct, UINT iSizeStruct);

	BOOL	RemoveKey(LPCTSTR lpSection, LPCTSTR lpKey);

protected:
	BOOL	GetString(LPCTSTR lpSection, LPCTSTR lpKey, CString& strRet, LPCTSTR strDefault, DWORD iSize);
};

