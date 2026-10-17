```
sudo apt install python3-full sqlite3 python3-pip
sudo pip3 install fitparse flask rdp --break-system-packages

mkdir -p ~/.config/systemd/user/
ln -s "/home/tm/Laufwerk-T/git_p1xeltm/grxcm-db/service-grxcm-db.service" ~/.config/systemd/user/service-grxcm-db.service
systemctl --user daemon-reload
systemctl --user enable --now service-grxcm-db
```