using System;
using System.Diagnostics;
using System.Net;
using System.Threading;

static class Launcher
{
    static void Main()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        try
        {
            if (!IsUp())
            {
                var psi = new ProcessStartInfo();
                psi.FileName = "node";
                psi.Arguments = "server.js";
                psi.WorkingDirectory = dir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                Process.Start(psi);
            }
        }
        catch { }
        for (int i = 0; i < 60; i++) { if (IsUp()) break; Thread.Sleep(250); }
        try
        {
            Process.Start(new ProcessStartInfo("http://localhost:3000") { UseShellExecute = true });
        }
        catch { }
    }

    static bool IsUp()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create("http://localhost:3000/api/load");
            req.Timeout = 800;
            req.ReadWriteTimeout = 800;
            using (var resp = (HttpWebResponse)req.GetResponse())
                return resp.StatusCode == HttpStatusCode.OK;
        }
        catch { return false; }
    }
}
