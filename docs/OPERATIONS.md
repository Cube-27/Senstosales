# SenstoSales operations guide

How to install, update and look after SenstoSales on a Windows 10 or 11 computer. You do not need administrator
rights for any of it.

## Install

1. Download the newest `SenstoSales_<version>_x64-setup.exe` from the project's GitHub Releases page.
2. Double-click the file.
3. The first time, Windows may show a blue box that says **Windows protected your PC**. This happens because the
   installer is not signed with a paid certificate. It is shown only once for each new installer you download.
   - Click **More info**.
   - Click **Run anyway**.
4. The installer puts SenstoSales in `%LOCALAPPDATA%\Programs\SenstoSales` and adds it to the Start menu. Your data
   is kept separately in `%LOCALAPPDATA%\SenstoSales`; uninstalling the app does not remove it.

## Updates

When SenstoSales starts, it looks for a newer version. If there is one, it downloads it while you work and then asks
**Install now** or **Later**.

- **Install now**: SenstoSales closes and a small progress window installs the new version. Your data stays where it
  is. If the new version needs to change how the data is stored, it makes a backup first.
- **Later**: nothing changes. SenstoSales asks again the next time it starts.

If the computer is offline, SenstoSales starts as usual and checks again next time.
