using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;

static class Launcher
{
    // Must stay in sync with server.js PREFERRED_PORTS.
    static readonly int[] Ports = { 3000, 4300, 8400, 8800, 9000, 9900 };

    static string Url(int port)
    {
        return "http://localhost:" + port;
    }

    // On some machines connecting to a closed port times out instead of refusing
    // instantly, so a naive sequential scan burns the per-port timeout on every
    // dead port. Probe all ports in parallel and take the first one that responds.
    static int ProbeOnce(int port, int timeoutMs)
    {
        var client = new TcpClient();
        var finished = new ManualResetEvent(false);
        int result = 0;
        try
        {
            client.BeginConnect("127.0.0.1", port, delegate (IAsyncResult ar)
            {
                try
                {
                    client.EndConnect(ar);
                    result = port;
                }
                catch { }
                try { client.Close(); } catch { }
                finished.Set();
            }, null);
            if (!finished.WaitOne(timeoutMs))
            {
                try { client.Close(); } catch { }
                result = 0;
            }
        }
        catch { }
        return result;
    }

    static int FirstUp(int timeoutMs)
    {
        var results = new int[Ports.Length];
        var tasks = new Task[Ports.Length];
        for (int i = 0; i < Ports.Length; i++)
        {
            int p = Ports[i];
            int idx = i;
            tasks[i] = Task.Factory.StartNew(delegate { results[idx] = ProbeOnce(p, timeoutMs); });
        }
        Task.WaitAll(tasks);
        foreach (var r in results) if (r != 0) return r;
        return 0;
    }

    // Spawn the server with its console output appended to Server.log in the
    // app folder. A FILE redirection stays valid for the server's whole life,
    // so it can never die from an EPIPE on an orphaned pipe once this launcher
    // (which used to read the port line and then exit) goes away.
    static void SpawnServer(string dir)
    {
        var psi = new ProcessStartInfo();
        psi.FileName = "cmd.exe";
        string logPath = Path.Combine(dir, "Server.log");
        psi.Arguments = "/c node server.js 1>>\"" + logPath + "\" 2>&1";
        psi.WorkingDirectory = dir;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        try { Process.Start(psi); } catch { }
    }

    static void OpenBrowser(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch { }
    }

    static void Main()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        int port = FirstUp(700);
        if (port != 0)
        {
            OpenBrowser(Url(port));
            return;
        }
        SpawnServer(dir);
        int bound = 0;
        for (int i = 0; i < 60; i++)
        {
            bound = FirstUp(500);
            if (bound != 0) break;
            Thread.Sleep(300);
        }
        OpenBrowser(Url(bound == 0 ? 4300 : bound));
    }
}