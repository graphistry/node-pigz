{
  "targets": [
    {
      "target_name": "compress",
      "sources": [ "compress.cc" ],
      "include_dirs"  : [
            "<!(node -e \"require('nan')\")"
      ],
      "cflags": ["-g"]
    }
  ]
}
