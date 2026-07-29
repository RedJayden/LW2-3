#pragma once

template<class T> class CSingleton
{
protected:
	// Instance Constructor
	CSingleton() {}

	// Instance Destrcutor
	~CSingleton() {}

public:
	static T* GetInstance()
	{
		if (!m_pInstance)
		{
			m_pInstance = new T;
		}

		return m_pInstance;
	}

	static void Release()
	{
		if (m_pInstance)
		{
			delete m_pInstance;
			m_pInstance = NULL;
		}
	}

private:
	static T* m_pInstance;
};

template<class T> T* CSingleton<T>::m_pInstance = NULL;
