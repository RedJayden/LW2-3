#include "stdafx.h"
#include "StringUtil.h"

namespace Str // String Util
{
	CStringW ToStringW( int Value )
	{
		CStringW ret;
		ret.Format( L"%d" , Value );

		return ret;
	}

	CStringW ToStringW( float Value )
	{
		CStringW ret;
		ret.Format( L"%f" , Value );

		return ret;
	}

	CStringW ToStringW( float Value , int Point )
	{
		WCHAR pre[] = { L'%' , L'.' , TCHAR( Point + L'0' ) , L'f' , L'\0' };
	
		CStringW ret;
		ret.Format( pre , Value );

		return ret;
	}

	CStringW ToStringW( double Value )
	{
		CStringW ret;
		ret.Format( L"%f" , Value );

		return ret;
	}

	CStringW ToStringW( double Value , int Point )
	{
		WCHAR pre[] = { L'%' , L'.' , TCHAR( Point + L'0' ) , L'f' , L'\0' };
	
		CStringW ret;
		ret.Format( pre , Value );

		return ret;
	}

	CStringW ToStringW( CStringW Value ) { return Value; }

	CStringA ToStringA( int Value )
	{
		CStringA ret;
		ret.Format( "%d" , Value );

		return ret;
	}

	CStringA ToStringA( float Value )
	{
		CStringA ret;
		ret.Format("%f" , Value );

		return ret;
	}

	CStringA ToStringA( float Value , int Point )
	{
		char pre[] = { '%' , '.' , char( Point + '0' ) , 'f' , '\0' };
	
		CStringA ret;
		ret.Format( pre , Value );

		return ret;
	}

	CStringA ToStringA( double Value )
	{
		CStringA ret;
		ret.Format( "%f" , Value );

		return ret;
	}

	CStringA ToStringA( double Value , int Point )
	{
		char pre[] = { '%' , '.' , char( Point + '0' ) , 'f' , '\0' };
	
		CStringA ret;
		ret.Format( pre , Value );

		return ret;
	}

	CStringA ToStringA( CStringA Value ) { return Value; }

	int	ToInt( LPCTSTR Str )
	{
		 return _ttoi( Str );
	}

	double ToDouble( LPCTSTR Str )
	{
		return _ttof( Str );
	}

	HighOrderVector<CStringA> TokenizerA( const CStringA& Str , CHAR Step )
	{
		return TokenizerW( (CStringW)Str , (WCHAR)Step )
				.map<CStringA>( []( CStringW& arg ) { return (CStringA)arg; });
	}

	HighOrderVector<CStringW> TokenizerW( const CStringW& Str , WCHAR Step )
	{
		CString Value;
		int Index = 0;
		
		HighOrderVector<CString> Ret;

		while ( AfxExtractSubString( Value , Str , Index++ , Step ) )
		{
			if ( Value.IsEmpty() ) continue;

			Ret.push_back( std::move( Value ) );
		}
		
		return Ret;
	}

	HighOrderVector<CStringA> TokenizerA( const CStringA& Str , const CStringA& Step )
	{
		return TokenizerW( (CStringW)Str , (CStringW)Step )
					.map<CStringA>( []( CStringW& arg ) { return (CStringA)arg; });
	}
	
	HighOrderVector<CStringW> TokenizerW( const CStringW& Str , const CStringW& Step )
	{
		int Pos = 0;
		HighOrderVector<CStringW> Ret;

		CStringW Value;

		do
		{
			Value = Str.Tokenize( Step , Pos );
			if ( Value.IsEmpty() ) break;

			Ret.push_back( Value );

		} while( true ) ;

		return Ret;
	}

	CStringW _W( LPCTSTR Format , ... )
	{
		va_list ap;
		va_start( ap, Format );
		
		WCHAR Result[4096] = { 0 , };
		vswprintf_s( Result , Format , ap );

		return CStringW( Result );
	}

	CStringA _A( LPCSTR Format , ... )
	{
		va_list ap;
		va_start( ap, Format );

		CHAR Result[4096] = { 0 , };
		vsprintf_s( Result , Format , ap );

		return CStringA( Result );
	}

	int HexToIntW( WCHAR ch )
	{
		if ( L'0' <= ch && ch <= L'9' ) return ch - L'0';

		if ( L'a' <= ch && ch <= L'f' ) return ch - L'a' + 10;

		if ( L'A' <= ch && ch <= L'F' ) return ch - L'A' + 10;

		return 0;
	}

	int	HexToIntA( CHAR Hex )
	{
		return HexToIntW( (WCHAR)Hex );
	}

	int HexToIntW( CStringW Hex )
	{	
		// 16진수 Prefix "0x" 부분 삭제(만약 존재한다면)
		if ( Hex.GetLength() > 2 )
		{
			TCHAR Prefix1 = Hex.GetAt(0);
			TCHAR Prefix2 = Hex.GetAt(1);

			if ( Prefix1 == L'0' && (Prefix2 == L'x' || Prefix2 == L'X') )
			{
				Hex.Delete(0);
				Hex.Delete(0);
			}
		}

		int Ret = 0;
		int Len = Hex.GetLength();

		for ( int i = 0 ; i < Len ; ++i )
		{
			Ret <<= 4;
			Ret |= HexToIntW( Hex.GetAt(i) );
		}

		return Ret;
	}

	int HexToIntA( CStringA Hex )
	{
		return HexToIntW( (CStringW)Hex );
	}

	BOOL HasPrefixA( const CStringA& String , const CStringA& Prefix )
	{
		if ( String.GetLength() < Prefix.GetLength() ) return FALSE;

		return String.Left( Prefix.GetLength() ) == Prefix;
	}

	BOOL HasSuffixA( const CStringA& String , const CStringA& Suffix )
	{
		if ( String.GetLength() < Suffix.GetLength() ) return FALSE;
    
		return String.Right( Suffix.GetLength() ) == Suffix;
	}

	BOOL HasPrefixW( const CStringW& String , const CStringW& Prefix )
	{
		if ( String.GetLength() < Prefix.GetLength() ) return FALSE;

		return String.Left( Prefix.GetLength() ) == Prefix;
	}

	BOOL HasSuffixW( const CStringW& String , const CStringW& Suffix )
	{
		if ( String.GetLength() < Suffix.GetLength() ) return FALSE;
    
		return String.Right( Suffix.GetLength() ) == Suffix;
	}

	CString IntToHex( int Value , int MinimumLen )
	{
		CString Ret	= STR( _T("%X") , Value );
		if ( MinimumLen <= 0 ) return Ret;

		int RetLen = Ret.GetLength();

		for ( int i = MinimumLen - RetLen ; i > 0 ; --i )
			Ret.Insert( 0 , _T('0') );

		return Ret;
	}

	CString ByteToHex( const BYTE* pSrc , int Size )
	{
		CString Ret;

		for ( int i = 0 ; i < Size ; ++i )
			Ret.Append( IntToHex( pSrc[i] , 0 ) );

		return Ret;
	}
};
