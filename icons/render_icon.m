#import <AppKit/AppKit.h>

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSString *directory = argc > 1 ? [NSString stringWithUTF8String:argv[1]] : @"icons";
    NSArray<NSNumber *> *sizes = @[@16, @32, @48, @128];

    for (NSNumber *sizeValue in sizes) {
      NSInteger size = sizeValue.integerValue;
      CGFloat scale = (CGFloat)size / 128.0;
      NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc]
        initWithBitmapDataPlanes:NULL pixelsWide:size pixelsHigh:size bitsPerSample:8
        samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace
        bytesPerRow:0 bitsPerPixel:0];

      [NSGraphicsContext saveGraphicsState];
      [NSGraphicsContext setCurrentContext:[NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap]];
      [[NSColor clearColor] setFill];
      NSRectFillUsingOperation(NSMakeRect(0, 0, size, size), NSCompositingOperationCopy);

      [[NSColor colorWithCalibratedRed:201.0/255.0 green:31.0/255.0 blue:38.0/255.0 alpha:1] setFill];
      [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(4*scale, 4*scale, 120*scale, 120*scale)
        xRadius:28*scale yRadius:28*scale] fill];

      NSBezierPath *play = [NSBezierPath bezierPath];
      [play moveToPoint:NSMakePoint(52*scale, 38*scale)];
      [play lineToPoint:NSMakePoint(91*scale, 64*scale)];
      [play lineToPoint:NSMakePoint(52*scale, 90*scale)];
      [play closePath];
      [[NSColor whiteColor] setFill];
      [play fill];
      [NSGraphicsContext restoreGraphicsState];

      NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
      NSString *path = [directory stringByAppendingPathComponent:[NSString stringWithFormat:@"icon%ld.png", size]];
      if (![png writeToFile:path atomically:YES]) return 1;
    }
  }
  return 0;
}
